sap.ui.define([
	'Zeiterfassung/controller/BaseController',
	'sap/m/MessageToast',
	'sap/ui/model/json/JSONModel',
	'Zeiterfassung/model/formatter',
	'Zeiterfassung/service/onepoint/queries',
	"sap/m/MessageBox",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	'sap/ui/unified/CalendarLegendItem',
	'sap/ui/unified/DateTypeRange',
	'sap/ui/unified/DateRange'
], function (BaseController, MessageToast, JSONModel, formatter, queries, MessageBox, Filter, FilterOperator, CalendarLegendItem,
	DateTypeRange, DateRange) {
	"use strict";

	var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);

	return BaseController.extend("Zeiterfassung.controller.others.DetailOther", {
		formatter: formatter,

		onInit: function () {

			this.userId = sap.ui.getCore().getModel("user").getProperty("/id");
			this.persNr = sap.ui.getCore().getModel("user").getProperty("/persNr");
			this.userPersNrWithZeros = sap.ui.getCore().getModel("user").getProperty("/persNrWithZeros");
			this.durationSelected = false;
			this.activityTypeSelected = false;
			this.descSelected = false;
			this.date = new Date();

			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.getRoute("detailOthers").attachPatternMatched(this._onObjectMatched, this);

			// model for total work time for selected date
			var totalTime = new JSONModel({
				workTime: 0,
				activityTime: 0
			});
			this.getView().setModel(totalTime, "totalWorkTime");

			var busyModel = new JSONModel({
				busy: false
			});

			this.getView().setModel(busyModel, "busy");

			var hiddenModel = new JSONModel({
				noProject: true,
				page: false,
			})
			this.setModel(hiddenModel, "hiddenModel");
			this.createCalLengd();

			this.oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			this.oEventBus.subscribe(
				"setCalendarDate",
				this.setCalendarDate,
				this
			);

		},

		onAfterRendering: function () {
			this._refreshOdata();
			this.getTimeEntriesForCurrentMonth();
		},

		_refreshOdata: function () {
			var oModel = this.getView().getModel();
			oModel.refresh(true);
		},

		_onObjectMatched: function (oEvent) {
			var oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			oEventBus.subscribe(
				"putValueFromTimerToInput",
				this.putTimeToProject,
				this
			);

			// use event bus to call checkClockstate from timer controller
			var oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			oEventBus.publish(
				"checkClockState"
			);

			oEventBus.publish(
				"startPresenceClock"
			);

			this.clearInputs();
			var hoursWorked = sap.ui.getCore().getModel("hoursWorked");
			if (hoursWorked !== undefined || hoursWorked !== null) {
				this.setModel(hoursWorked, "hoursWorked");
			}
			this.getModel("hiddenModel").setProperty("/noProject", false);
			this.getModel("hiddenModel").setProperty("/page", true);
			this.getModel("busy").setProperty("/busy", true);
			this.isMonthCompleted();
			this.selectedProject = sap.ui.getCore().getModel("selectedProject").getData();
			this.type = this.selectedProject.Type;
			this.typeSub = this.selectedProject.TypeSub;
			var subSetMOdel = new JSONModel(this.selectedProject);
			this.setModel(subSetMOdel, "subset");
			this.getOrderType();
			this.isFavorite();
			this.getModel("busy").setProperty("/busy", false);
			this.projectIsInDb = false;
			this.getProjectsFromDb();
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

		onShowTimeDetailDialog: function (oEvent) {
			this.showDialog(oEvent);
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

		getSearchFilters: function (query) {
			return new Filter({
				filters: [
					new Filter("Type", FilterOperator.EQ, this.type)
				],
				and: true
			});
		},

		isFavorite: function () {
			var oModel = new JSONModel({
				isFavorite: false
			});
			this.setModel(oModel, "favoriteModel");
			var self = this;
			var activitiesLocal = oStorage.get("otherActivities");
			if (activitiesLocal !== null) {
				var activitiesLocalArray = JSON.parse(activitiesLocal);
				activitiesLocalArray.forEach(function (item) {
					if (item.Type === self.type && item.TypeSub === self.typeSub) {
						self.getModel("favoriteModel").setProperty("/isFavorite", true);
					}
				});
			}
		},

		onAddFavorite: function (oEvent) {
			var pressed = oEvent.getSource().getPressed();
			var self = this;
			var activitiesLocal = oStorage.get("otherActivities");
			var activitiesLocalArray;
			if (pressed === true) {
				if (activitiesLocal === null) {
					var activities = [];
					activities.push(this.selectedProject);
					oStorage.put("otherActivities", JSON.stringify(activities));
				} else {
					activitiesLocalArray = JSON.parse(activitiesLocal);
					activitiesLocalArray.push(this.selectedProject);
					oStorage.put("otherActivities", JSON.stringify(activitiesLocalArray));
				}
			} else {
				activitiesLocalArray = JSON.parse(activitiesLocal);
				activitiesLocalArray.forEach(function (item, index) {
					if (item.Type === self.type && item.TypeSub === self.typeSub) {
						activitiesLocalArray.splice(index, 1);
					}
				});
				oStorage.put("otherActivities", JSON.stringify(activitiesLocalArray));
			}
		},

		getOrderType: function () {
			var oModel = this.getView().getModel();
			var self = this;
			oModel.read("/CustOrdTypeSet", {
				success: function (oResponse, oData) {
					for (var i = 0; i < oResponse.results.length; i++) {
						if (oResponse.results[i].Type === self.selectedProject.Type) {
							var orderModel = new JSONModel({
								description: oResponse.results[i].Description
							});
							self.setModel(orderModel, "orderDescModel");
							self.projectTitle = oResponse.results[i].Description;
						}
					}
				},
				error: function (oError) {
					console.log(oError);
				}
			});
		},

		/*    
			converts a given date to a timestamp
			@param {Date}
			
		*/
		_convertDateToTimestamp: function (date) {
			var day = date.getDate();
			var month = date.getMonth();
			var year = date.getFullYear();
			var dateNew = new Date(Date.UTC(year, month, day));
			var timestamp = dateNew.getTime();
			return timestamp;
		},

		setActivityType: function (oEvent) {
			if (oEvent.getSource().getSelectedItem() !== null) {
				this.activityType = oEvent.getSource().getSelectedItem().getText();
				this.activityTypeSelected = true;
			} else {
				this.activityTypeSelected = false;
			}
		},

		setWorkDuration: function (oEvent, timer) {
			var duration;
			if (timer) {
				duration = this.byId("inputTime").getValue();
			} else {
				duration = oEvent.getParameter("value");
			}
			if (duration !== null) {
				var hoursToMinues = duration.slice(0, 2);
				var minutes = duration.slice(3, 5) / 60;
				var hoursToMinuesInt = parseFloat(hoursToMinues);
				var minutesInt = parseFloat(minutes);
				var totalDuration = hoursToMinuesInt + minutesInt;
				this.duration = totalDuration.toString();
				this.durationSelected = true;
			} else {
				this.durationSelected = false;
			}

		},

		setDescription: function (oEvent) {
			this.desc = oEvent.getSource().getValue();
			if (this.desc !== null) {
				this.descSelected = true;
			} else {
				this.descSelected = false;
			}
		},

		validateInputs: function () {
			if (this.durationSelected && this.descSelected) {
				return true;
			} else {
				return false;
			}
		},

		onPressStartButton: function (oEvent) {
			/*
				buttonStatus: ghost = not pressed, Reject = pressed
			*/
			var buttonStatus = oEvent.getSource().getType();

			if (buttonStatus === "Ghost") {
				oEvent.getSource().setType(sap.m.ButtonType.Reject);
				oEvent.getSource().setIcon('sap-icon://stop');
				oEvent.getSource().setText("Stop")
				const startDate = new Date();
				const startStamp = startDate.getTime();
				var startDateLocale = startDate.toLocaleString('de-DE', {
					timeZone: 'Europe/Berlin'
				});

				// localstorage object
				var pastTimeActivity = {
					startDateLocale,
					startStamp,
					stopped: false
				}
				oStorage.put("pastTimeActivity", JSON.stringify(pastTimeActivity));
				this.startClock();
			} else if (buttonStatus === "Reject") {
				oEvent.getSource().setType(sap.m.ButtonType.Ghost);
				oEvent.getSource().setIcon('sap-icon://play');
				oEvent.getSource().setText("Start")
				this.stopClock();
			}
		},

		startClock: function () {
			var pastTimeActivity = oStorage.get("pastTimeActivity");
			if (pastTimeActivity !== null) {

				// use this for showing the remaining time
				var pastTimeObject = JSON.parse(pastTimeActivity);
				var startStamp = pastTimeObject.startStamp;

				// oModel to show information about time in the UI
				var oModel = new JSONModel({
					startDateLocale: pastTimeObject.startDateLocale,
					time: null,
					hours: null,
					minutes: null,
				});

				this.setModel(oModel, "pastTimeActivity");
				this.getModel("hiddenModel").setProperty("/showFooter", true)
				this.getModel("hiddenModel").setProperty("/showPutTimeButton", false);

				this.interval = setInterval(() => {
					this.updateClock(startStamp);
				}, 1000);

				var localIntervals = oStorage.get("interval");

				if (localIntervals === null) {
					var intervallArray = [];
					intervallArray.push(this.interval);
					oStorage.put("interval", JSON.stringify(intervallArray));
				} else {
					var array = JSON.parse(localIntervals)
					array.push(this.interval);
					oStorage.put("interval", JSON.stringify(array));
				}
			}
		},

		updateClock: function (startStamp) {
			let newDate = new Date();
			let newStamp = newDate.getTime();

			let diff = Math.round((newStamp - startStamp) / 1000);

			let d = Math.floor(diff / (24 * 60 * 60));
			diff = diff - (d * 24 * 60 * 60);
			let h = Math.floor(diff / (60 * 60));
			diff = diff - (h * 60 * 60);
			let m = Math.floor(diff / (60));
			diff = diff - (m * 60);
			let s = diff;

			if (h < 10) {
				h = "0" + h
			};
			if (m < 10) {
				m = "0" + m
			};
			if (s < 10) {
				s = "0" + s
			};

			this.getModel("pastTimeActivity").setProperty("/time", h + ":" + m + ":" + s);
			this.getModel("pastTimeActivity").setProperty("/hours", h);
			this.getModel("pastTimeActivity").setProperty("/minutes", m);
		},

		stopClock: function () {
			var pastTime = this.getModel("pastTimeActivity");
			var pastTimeActivity = oStorage.get("pastTimeActivity");
			var pastTimeObject = JSON.parse(pastTimeActivity);
			const endDate = new Date();

			var endDateLocale = endDate.toLocaleString('de-DE', {
				timeZone: 'Europe/Berlin'
			});

			var pastTimeActivity = {
				startDateLocale: pastTimeObject.startDateLocale,
				endDateLocale: endDateLocale,
				startStamp: pastTimeObject.startStamp,
				stopped: true,
				duration: pastTime.getProperty("/time"),
				hours: this.getModel("pastTimeActivity").getProperty("/hours"),
				minutes: this.getModel("pastTimeActivity").getProperty("/minutes")
			}

			oStorage.put("pastTimeActivity", JSON.stringify(pastTimeActivity));
			this.clearInterval();

			this.getModel("hiddenModel").setProperty("/showPutTimeButton", true);
			this.getModel("pastTimeActivity").setProperty("/endDateLocale", endDateLocale);
			oStorage.remove("interval");
		},

		clearInterval: function () {
			var array = oStorage.get("interval");
			var intervalArray = JSON.parse(array);
			intervalArray.forEach(function (item) {
				clearInterval(item);
			})
		},

		putTimeToProject: function (sChannelId, sEventId, oData) {
			var oModel = new JSONModel({
				time: oData.hours + ":" + oData.minutes
			})
			this.setModel(oModel, "hoursWorked");
			this.setWorkDuration(null, true);
		},

		onCreateEntry: function () {
			var selectedDate = this.date;
			var dateFormat = sap.ui.core.format.DateFormat.getDateInstance({
				pattern: "YYYY-MM-ddTHH:mm:ss"
			});
			var formattedDate = dateFormat.format(selectedDate);
			// check selected times
			var oModel = this.getView().getModel();

			if (this.validateInputs()) {

				var oEntry = {};
				oEntry.EmployeeId = this.persNr.toString();
				oEntry.Datum = formattedDate;
				oEntry.Duration = this.duration;
				oEntry.ActivityTitle = this.selectedProject.Description;
				oEntry.ProjectTitle = this.projectTitle;
				//oEntry.ActivityType = this.activityType;
				oEntry.Description = this.desc;
				oEntry.ParentKey = this.parrentKey;

				oModel.setHeaders({
					"content-type": "application/json",
					"method": "POST",
					"charset": "utf-8",
					"X-CSRF-Token": "Sy20dYnUW2c22JGDMqhZHg=="
				});
				oModel.create('/OrderItemSet', oEntry, {
					success: function (oData, oResponse) {
						// Success 
						MessageToast.show("Zeit wurde gespeichert");
					},
					error: function (oError) {
						// Error 
						MessageToast.show("Zeit konnte nicht gespeichert werden");
					}
				});
				this.durationSelected = false;
				this.activityTypeSelected = false;
				this.descSelected = false;
				this.clearInputs();
			} else {
				var bCompact = !!this.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.alert(
					"Bitte füllen Sie alle Pflichtfelder aus", {
						styleClass: bCompact ? "sapUiSizeCompact" : ""
					}
				);
			}
			this.getTimeEntriesForCurrentMonth();
			this.oEventBus.publish("calculateTotalActivityTimeforDay");
		},

		_destroySpecialDate: function (oEvent) {
			var oCal1 = this.byId("calendar");
			//oCal1.removeSpecialDate(indexOfDate);
			oCal1.destroySpecialDates();
			this.getTimeEntriesForCurrentMonth();
		},

		createCalLengd: function () {
			var oLeg1 = this.byId("legend1");
			oLeg1.addItem(new CalendarLegendItem({
				text: "Tätigkeit",
				color: "#d58215"
			}));
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

		clearInputs: function () {
			this.byId("inputTime").setValue("");
			this.byId("area0").setValue("");
		},

		getProjectsFromDb: function () {
			var oModel = this.getView().getModel();
			var self = this;

			var dataLoaded = oModel.read("/OrderSet", {
				success: function (response, oData) {
					//response will have the return of the request
					self.getIsProjectInDb(response);
				},
				error: function (e) {
					console.log(e)
				}
			});
		},

		getIsProjectInDb: function (project) {
			var projectArray = project.results;
			for (var i = 0; i < projectArray.length; i++) {
				if (projectArray[i].OrderTyp === this.type && projectArray[i].OrderTypeSub === this.typeSub) {
					this.projectIsInDb = true;
					this.parrentKey = projectArray[i].DbKey;
					this.projectDescription = projectArray[i].Description;
					break;
				}
			}
			if (this.projectIsInDb === false) {
				this.initProjectinDb(this.type, this.typeSub, this.projectTitle);
				this.projectIsInDb = false;
			}
		},

		initProjectinDb: function (type, typeSub, currentProjectTitle) {
			var oModel = this.getView().getModel();
			var oEntry = {};
			var self = this;

			oEntry.OrderTyp = type;
			oEntry.OrderTypeSub = typeSub;
			oEntry.Description = currentProjectTitle;

			oModel.setHeaders({
				"content-type": "application/json",
				"method": "POST",
				"charset": "utf-8",
				"X-CSRF-Token": "Sy20dYnUW2c22JGDMqhZHg=="
			});
			oModel.create('/OrderSet', oEntry, {
				success: function (oData, oResponse) {
					self.parrentKey = oData.DbKey;
				},
				error: function (oError) {
					console.log(oError)
				}
			});
		},

	});
});