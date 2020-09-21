sap.ui.define([
	'./BaseController',
	'sap/ui/model/json/JSONModel',
	'sap/ui/Device',
	'Zeiterfassung/model/formatter',
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	'sap/ui/unified/CalendarLegendItem',
	'sap/ui/unified/DateTypeRange',
	'sap/m/Table',
	'../service/onepoint/queries',
	'Zeiterfassung/controller/Timer.controller',
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/Text",
	"sap/m/FlexBox",
	'sap/ui/unified/DateRange',
	'../service/zammad/zammadService'
], function (BaseController, JSONModel, Device, formatter, Filter, FilterOperator, MessageBox, MessageToast, CalendarLegendItem,
	DateTypeRange, Table, queries, Timer, Dialog, Button, Text, FlexBox, DateRange, zammadService) {
	"use strict";

	var interval = null;

	return BaseController.extend("Zeiterfassung.controller.Home", {
		formatter: formatter,

		/******** Liefecyle Events *******/

		Timer: Timer,
		fixedSizeDialog: null,

		onInit: function () {

			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.getRoute("home").attachPatternMatched(this._onObjectMatched, this);
			this.setControllerModel();

			this.token = queries.getToken();
			this.date = new Date();

			//timeType - 0=default, 1=Home Office, 2=Bereitschaft
			this.timeType = 0;

			this.createCalLengd();

			this.oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();

			this.oEventBus.subscribe(
				"setModelFromTimer",
				this.setModelFromTimer,
				this
			);

			this.oEventBus.subscribe(
				"destroySpecialDate",
				this._destroySpecialDate,
				this
			);

		},

		setModelFromTimer: function (sChannelId, sEventId, oData) {
			this.setModel(oData.model, oData.modelName);
			if (oData.modelName === "kommenModel") {
				this.isKommenSelected = true;
				this.setKommenModel(oData.model.oData.date);
			}
		},

		onAfterRendering: function () {
			this.userId = sap.ui.getCore().getModel("user").getProperty("/id");
			this.userPersNr = sap.ui.getCore().getModel("user").getProperty("/persNr");
			this.userPersNrWithZeros = sap.ui.getCore().getModel("user").getProperty("/persNrWithZeros");
			this._refreshOdata();
			this.isMonthCompleted();
			this.getTimeEntriesForCurrentMonth();
		},

		_onObjectMatched: function (oEvent) {
			this.setPageModel(0);
			this.setFavoriteActivities();
			this.setFavoriteOtherActivites();

			// use event bus to call checkClockstate from timer controller
			this.oEventBus.publish(
				"checkClockState", {
					hidePutTime: true
				}
			);

			this.setCalendarDate();
		},

		setCalendarDate: function () {
			var date = sap.ui.getCore().getModel("selectedDate").getProperty("/date");
			if (date) {
				var calendar = this.byId("calendar");
				calendar.destroySelectedDates();
				var oSelectedDate = new sap.ui.unified.DateRange({
					startDate: date
				})
				calendar.addSelectedDate(oSelectedDate)
				this.calendarSelect(null, false, date);
			}
		},

		// set model on init

		setControllerModel: function () {
			var oDate = new JSONModel(this.date);
			sap.ui.getCore().setModel(oDate, "selectedDate");

			var oViewModel = new JSONModel({
				isPhone: Device.system.phone
			});
			this.setModel(oViewModel, "view");
			Device.media.attachHandler(function (oDevice) {
				this.getModel("view").setProperty("/isPhone", oDevice.name === "Phone");
			}.bind(this));

			// model for total work time for selected date
			var totalTime = new JSONModel({
				workTime: 0,
				activityTime: 0
			});
			this.getView().setModel(totalTime, "totalWorkTime");

			var isListLoading = new JSONModel({
				loading: true
			});
			this.getView().setModel(isListLoading, "isListLoading");

		},

		/******** Controller Functions *******/

		_refreshOdata: function () {
			var oModel = this.getView().getModel();
			oModel.refresh(true);
		},

		createCalLengd: function () {
			var oLeg1 = this.byId("legend1");
			oLeg1.addItem(new CalendarLegendItem({
				text: "Anwesenheit",
				color: "#d58215",
			}));
		},

		onFavPressed: function (oEvent) {
			var oItem = oEvent.getSource();
			var oData = oItem.getBindingContext("favoritesModel").getObject();
			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.navTo("master", {
				activityId: oData.activity.id
			});
		},

		onOtherFavPressed: function (oEvent) {
			var oItem = oEvent.getSource();
			var oData = oItem.getBindingContext("otherFavoritesModel").getObject();
			var oModel = new JSONModel(oData);
			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.navTo("others", {
				type: oData.Type,
				typeSub: oData.TypeSub
			});
			sap.ui.getCore().setModel(oModel, "selectedProject");
		},

		_calculateWorkTime: function (kommen, gehen) {
			var workHoursToMinutes = (gehen.getHours() - kommen.getHours()) * 60;
			var workMinutes = gehen.getMinutes() - kommen.getMinutes();
			var workHoursinMinutes = workHoursToMinutes + workMinutes;
			var workHoursNew = workHoursinMinutes / 60;
			/*if (workHoursNew > 6) {
				workHoursNew -= 0.5;
			}*/
			return workHoursNew.toString();
		},

		_getTimeIsSelected: function () {
			if (this.isGehenSelected && this.isKommenSelected) {
				return true;
			} else {
				return false;
			}
		},

		_clearInputs: function () {
			this.isGehenSelected = false;
			this.isKommenSelected = false;

			this.byId("pickerKommen").setValue("");
			this.byId("pickerGehen").setValue("");
		},

		_destroySpecialDate: function (oEvent) {
			var oCal1 = this.byId("calendar");
			//oCal1.removeSpecialDate(indexOfDate);
			oCal1.destroySpecialDates();
			this.getTimeEntriesForCurrentMonth();
		},

		getTimeEntriesForCurrentMonth: function () {
			var calendar = this.byId("calendar");
			var startDate = calendar.getStartDate();
			var endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
			var oModel = this.getView().getModel();
			var self = this;
			var filters = [];
			var filters = new Filter({
				filters: [
					new Filter("Pernr", FilterOperator.EQ, this.userPersNrWithZeros),
					new Filter("Datum", FilterOperator.BT, startDate, endDate)
				],
				and: true,
			});

			oModel.read("/PresTimeRecSet", {
				filters: filters.aFilters,
				success: function (response, oData) {
					//response will have the return of the request
					self.getActivityEntriesForCurrentMonth();
					self.timeEntries = response.results;
				},
				error: function (e) {
					console.log(e)
				}
			});
		},

		getActivityEntriesForCurrentMonth: function () {
			var calendar = this.byId("calendar");
			var startDate = calendar.getStartDate();
			var endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
			var oModel = this.getView().getModel();
			var self = this;
			var filters = [];
			var filters = new Filter({
				filters: [
					new Filter("EmployeeId", FilterOperator.EQ, this.userPersNrWithZeros),
					new Filter("Datum", FilterOperator.BT, startDate, endDate)
				],
				and: true,
			});

			oModel.read("/OrderItemSet", {
				filters: filters.aFilters,
				success: function (response, oData) {
					//response will have the return of the request
					self.activityEntries = response.results;
					self._showSpecialDays();
				},
				error: function (e) {
					console.log(e)
				}
			});
		},

		_showSpecialDays: function () {
			var oCal1 = this.byId("calendar");
			var date;
			var duration;
			var activityTimeEntries = [];
			var presenceTimeEntries = [];
			var timeObject = new Object();
			var self = this;

			this.activityEntries.forEach(function (item, index) {
				var activityEntriesLenght = self.activityEntries.length - 1;
				if (index === 0) {
					date = item.Datum;
					duration = item.Duration;
					timeObject.date = date;
					timeObject.duration = parseFloat(duration);

				} else {
					if (date.getTime() !== item.Datum.getTime()) {
						activityTimeEntries.push(timeObject);
						timeObject = new Object();
						date = item.Datum;
						duration = item.Duration;
						timeObject.date = date;
						timeObject.duration = parseFloat(duration);

						if (index === activityEntriesLenght) {
							activityTimeEntries.push(timeObject);
							timeObject = new Object();
						}
					} else {
						timeObject.duration += parseFloat(item.Duration);
						if (index === activityEntriesLenght) {
							activityTimeEntries.push(timeObject);
							timeObject = new Object();
						}
					}
				}

			});

			this.timeEntries.forEach(function (item, indexTime) {
				var timeEntriesEntriesLenght = self.timeEntries.length - 1;
				if (indexTime === 0) {
					date = item.Datum;
					duration = item.Dauer;
					timeObject.date = date;
					timeObject.duration = parseFloat(duration);

				} else {
					if (date.getTime() !== item.Datum.getTime()) {
						presenceTimeEntries.push(timeObject);
						timeObject = new Object();
						date = item.Datum;
						duration = item.Dauer;
						timeObject.date = date;
						timeObject.duration = parseFloat(duration);

						if (indexTime === timeEntriesEntriesLenght) {
							presenceTimeEntries.push(timeObject);
						}
					} else {
						timeObject.duration += parseFloat(item.Dauer);
						if (indexTime === timeEntriesEntriesLenght) {
							presenceTimeEntries.push(timeObject);
						}
					}
				}

			});

			this.compareTimeAndSetSpecialDate(activityTimeEntries, presenceTimeEntries);

		},

		/**
		 * Compare 2 time arrays and set color of calendar
		 *
		 * @param {array} date1 Array with Object
		 * @param {array} date2 Array with Object
		 */
		compareTimeAndSetSpecialDate: function (date1, date2) {
			var oCal1 = this.byId("calendar");
			var color;

			loop1:
				for (var y = 0; y < date1.length; y++) {
					loop2: for (var i = 0; i < date2.length; i++) {

						if (date1[y].date.getTime() === date2[i].date.getTime()) {
							if (date1[y].duration === date2[i].duration) {
								color = "#66CDAA";
							} else {
								color = "#FFA07A";
							}

							oCal1.addSpecialDate(new DateTypeRange({
								startDate: date1[y].date,
								//color: color
							}));

							continue loop1;
						}

					}
				}

		},

		setFavoriteActivities: function () {
			this.getFavoriteActivities()
				.then(result => {
					var oModel = new JSONModel(result);
					this.setModel(oModel, "favoritesModel");
					this.getModel("isListLoading").setProperty("/loading", false);
				}).catch(error => {
					console.log(error);
				});
		},

		setFavoriteOtherActivites: function () {
			var oModel = this.getFavoriteOtherActivites();
			this.setModel(oModel, "otherFavoritesModel");
		},

		/*	// this is just for creating demo entries in the db.
			_createDemo: function () {
				for (var i = 0; i < 50; i++) {
					var oModel = this.byId("table").getModel();
					var oEntry = {};
					oEntry.Pernr = "0080042";
					oEntry.Type = "0";
					oEntry.Datum = new Date();
					oEntry.Kommen = "PT07H52M00S";
					oEntry.Gehen = "PT07H52M00S";
					oEntry.Dauer = "3.56";
					oModel.setHeaders({
						"content-type": "application/json",
						"method": "POST",
						"charset": "utf-8",
						"X-CSRF-Token": "Sy20dYnUW2c22JGDMqhZHg=="
					});
					oModel.create("/PresTimeRecSet", oEntry, {
						success: function (oData, oResponse) {
							// Success 
							MessageToast.show("Zeit wurde gespeichert");
							oModel.refresh(true, true);
						},
						error: function (oError) {
							// Error 
							MessageToast.show("Zeit konnte nicht gespeichert werden");
						}
					});
				}
			},*/

		/******** Event Functions *******/

		/*
		 ***********presence timer********
		 */
		setPresenceTimer: function (oEvent, type) {
			var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);
			var pastTime = oStorage.get("pastTime");
			if (type === 'stop') {
				this.stopPresenceClock();
			} else {
				var startDate;

				var startTime = this.getModel("kommen").getProperty("/kommenRaw");
				startDate = this.kommenTime.date;

				const startStamp = startDate.getTime();

				var startHour = startDate.getHours();
				var startMinute = startDate.getMinutes();

				if (startHour < 10) {
					startHour = 0 + startHour;
				}

				if (startMinute < 10) {
					startMinute = 0 + startMinute;
				}

				var pastTime = {
					startHour,
					startMinute,
					startStamp
				}

				oStorage.put("pastTime", JSON.stringify(pastTime));
				this.startPresenceClock();
			}

		},

		stopPresenceClock: function () {
			this.oEventBus.publish(
				"stopPresenceClock"
			);
		},

		startPresenceClock: function () {
			// use event bus to call checkClockstate from timer controller
			this.oEventBus.publish(
				"startPresenceClock", {
					workTime: this.workTime
				}
			);
		},

		handleSelectToday: function () {
			var oCalendar = this.byId("calendar");

			oCalendar.removeAllSelectedDates();
			oCalendar.addSelectedDate(new DateRange({
				startDate: new Date()
			}));
			this.onCalendarSelect(null, true);
		},

		onCalendarSelect: function (oEvent, todayButtonSelected) {
			this.calendarSelect(oEvent, todayButtonSelected);
		},

		onChangeCalendarMonth: function (oEvent) {
			this.isMonthCompleted();
			this.getTimeEntriesForCurrentMonth();
		},

		onCompleteMonth: function (oEvent) {
			var calendar = this.byId("calendar");
			var selectedDate = calendar.getStartDate();
			selectedDate.setMonth(selectedDate.getMonth() - 1);
			var month = selectedDate.getMonth() + 1;
			var year = selectedDate.getFullYear().toString();
			MessageBox.show(
				`Möchten Sie ${formatter.dateToString(month, year)} abschließen?`, {
					icon: MessageBox.Icon.QUESTION,
					title: "Monat abschließen",
					actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
					emphasizedAction: MessageBox.Action.OK,
					initialFocus: MessageBox.Action.CANCEL,
					onClose: (sButton) => {
						if (sButton === MessageBox.Action.OK) {
							this.completeMonth();
						}
					}
				}
			);
		},

		unlock: function () {
			this.unlockMonth();
		},

		onCreateEntry: function () {
			var isMonthReleased = this.getModel("monthIsReleased").getProperty("/monthIsReleased");
			if (isMonthReleased === false) {
				if (this._getTimeIsSelected()) {
					this.getModel("pastTime").setProperty("/time", null)
					var selectedDate = this.date;
					var dateFormat = sap.ui.core.format.DateFormat.getDateInstance({
						pattern: "YYYY-MM-ddTHH:mm:ss"
					});
					var formattedDate = dateFormat.format(selectedDate);
					// call isMonthCompleted from basecontroller and set monthIsReleased
					//this.isMonthCompleted();
					var timeType = this.timeType;
					var kommen = this.kommenTime.kommen;
					var gehen = this.gehenTime.gehen;
					var workTime = this._calculateWorkTime(this.kommenTime.kommenRaw, this.gehenTime.gehenRaw);
					var oModel = this.getView().getModel();
					var oEntry = {};
					oEntry.Pernr = this.userPersNr.toString();
					oEntry.TimeType = timeType.toString();
					oEntry.Datum = formattedDate;
					oEntry.Kommen = kommen;
					oEntry.Gehen = gehen;
					oEntry.Dauer = workTime;
					oModel.setHeaders({
						"content-type": "application/json",
						"method": "POST",
						"charset": "utf-8",
						"X-CSRF-Token": "Sy20dYnUW2c22JGDMqhZHg=="
					});
					oModel.create('/PresTimeRecSet', oEntry, {
						success: function (oData, oResponse) {
							// Success 
							MessageToast.show("Zeit wurde gespeichert");
							oModel.refresh(true, true);
						},
						error: function (oError) {
							// Error 
							MessageToast.show("Zeit konnte nicht gespeichert werden");
						}
					});

					this._clearInputs();
					this.getTimeEntriesForCurrentMonth();
					this.oEventBus.publish("calculateTotalWorkTimeforDay");

				} else {
					var bCompact = !!this.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.alert(
						"Bitte geben Sie eine gültige Zeit ein", {
							styleClass: bCompact ? "sapUiSizeCompact" : ""
						}
					);
				}
			} else {
				var bCompact = !!this.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.alert(
					"Monat ist bereits abgeschlossen", {
						styleClass: bCompact ? "sapUiSizeCompact" : ""
					}
				);
			}

		},

		// set kommen from the input field 
		onSetKommen: function (oEvent) {
			this.stopPresenceClock();
			var selectedDate = oEvent.getSource().getDateValue();
			if (selectedDate !== null) {
				this.setKommenModel(selectedDate);
				this.isKommenSelected = true;
				this.setPresenceTimer(null, 'start');
			} else {
				this.isKommenSelected = false;
			}
		},

		// set kommen from kommen button
		onPressKommenButton: function (oEvent) {
			// stop the current clock and remove value from from local storage - otherwise the timer will start two times
			this.stopPresenceClock();
			var date = new Date();
			var roundet = this.roundTime(date);
			this.setKommenModel(roundet);
			this.isKommenSelected = true;
			this.setPresenceTimer(null, 'start');
		},

		roundTime: function (date) {
			var coeff = 1000 * 60 * 15;
			var rounded = new Date(Math.round(date.getTime() / coeff) * coeff);
			return rounded;
		},

		setKommenModel: function (selectedDate) {
			var edmTime = this.formatTime(selectedDate);
			var date = new Date();
			date.setHours(selectedDate.getHours(), selectedDate.getMinutes(), selectedDate.getSeconds());
			var oViewModel = new JSONModel({
				"kommen": edmTime,
				"kommenRaw": selectedDate
			});

			this.kommenTime = {
				"kommen": edmTime,
				"kommenRaw": selectedDate,
				"date": date
			};

			this.getView().setModel(oViewModel, "kommen");
		},

		formatTime: function (date) {
			var timeFormat = sap.ui.core.format.DateFormat.getTimeInstance({
				pattern: "PTHH'H'mm'M'ss'S'"
			});
			return timeFormat.format(date);
		},

		// stop timer from gehen button
		onPressGehenButton: function (oEvent) {
			// stop the current clock and remove value from from local storage - otherwise the timer will start two times
			this.stopPresenceClock();
			var date = new Date();
			var roundet = this.roundTime(date);
			var edmTime = this.formatTime(roundet);
			var oViewModel = new JSONModel({
				"gehen": edmTime,
				"gehenRaw": roundet
			});
			this.gehenTime = {
				"gehen": edmTime,
				"gehenRaw": roundet
			};
			this.getView().setModel(oViewModel, "gehen");

			var hour = roundet.getHours();
			var minute = roundet.getMinutes();
			var oModel = new JSONModel({
				time: hour + ":" + minute
			})
			this.setModel(oModel, "gehenModel");

			this.isGehenSelected = true;
			this.setPresenceTimer(null, 'stop');
		},

		// stop timer from gehen input field
		onSetGehen: function (oEvent) {
			var selectedDate = oEvent.getSource().getDateValue();
			if (selectedDate !== null) {
				var edmTime = this.formatTime(selectedDate);
				var oViewModel = new JSONModel({
					"gehen": edmTime,
					"gehenRaw": selectedDate
				});

				this.gehenTime = {
					"gehen": edmTime,
					"gehenRaw": selectedDate
				};

				this.getView().setModel(oViewModel, "gehen");
				this.isGehenSelected = true;
				this.setPresenceTimer(null, 'stop');
			} else {
				this.isGehenSelected = false;
			}
		},

		onChangeTimeType: function (oEvent) {
			var oSelectedIndex = oEvent;
			this.timeType = 0;
			if (oSelectedIndex === 1) {
				this.timeType = 1;
			} else if (oSelectedIndex === 2) {
				this.timeType = 2;
			}
		}

	});
});