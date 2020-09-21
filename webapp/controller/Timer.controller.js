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
	'../service/onepoint/queries'
], function (BaseController, JSONModel, Device, formatter, Filter, FilterOperator, MessageBox, MessageToast, CalendarLegendItem,
	DateTypeRange, Table, queries, ) {
	"use strict";

	var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);
	var interval = null;

	return BaseController.extend("Zeiterfassung.controller.Timer", {

		onInit: function () {

			var oModel = new JSONModel({
				showFooter: false,
				showPutTimeButton: false,
				showStopped: false,
				showWorkTime: false,
				showDayTimer: true
			});
			this.setModel(oModel, "footerModel");

			this.oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			this.oEventBus.subscribe(
				"checkClockState",
				this.checkClockState,
				this
			);

			this.oEventBus.subscribe(
				"startPresenceClock",
				this.startPresenceClock,
				this
			);

			this.oEventBus.subscribe(
				"stopPresenceClock",
				this.stopPresenceClock,
				this
			);

			this.oEventBus.subscribe(
				"setModelForTimer",
				this.setModelForTimer,
				this
			);

			this.oEventBus.subscribe(
				"hideTimer",
				this.hideTimer,
				this
			);

			this.checkClockState();

		},

		onAfterRendering: function () {
			var self = this;
			$("#homeBtn").click(function () {
				self.clearIntervalFunc();
			});

		},

		/********************************************************************
		 *********************** Project Timer ******************************
		 ********************************************************************/

		onPressStartButton: function (oEvent) {
			/*
				buttonStatus: ghost = not pressed, Reject = pressed
			*/
			var buttonStatus = oEvent.getSource().getType();

			if (buttonStatus === "Ghost") {
				oEvent.getSource().setType(sap.m.ButtonType.Reject);
				oEvent.getSource().setIcon('sap-icon://stop');
				oEvent.getSource().setText("Stop")
				var startDate = new Date();
				var startStamp = startDate.getTime();
				var startDateLocale = startDate.toLocaleTimeString('de-DE', {
					timeZone: 'Europe/Berlin'
				});

				// localstorage object
				var pastTimeActivity = {
					startDateLocale,
					startStamp,
					stopped: false
				};

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
				this.getModel("footerModel").setProperty("/showFooter", true)
				this.getModel("footerModel").setProperty("/showPutTimeButton", false);
				this.getModel("footerModel").setProperty("/showStopped", false);

				interval = setInterval(() => {
					this.updateClock(startStamp);
				}, 1000);

				var localIntervals = oStorage.get("interval");

				this.setIntervalToLocalStorage(interval);
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

			var endDateLocale = endDate.toLocaleTimeString('de-DE', {
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
			this.clearIntervalFunc();
			if (!this.hidePutTime) {
				this.getModel("footerModel").setProperty("/showPutTimeButton", true);
			}
			this.getModel("footerModel").setProperty("/showStopped", true);
			this.getModel("pastTimeActivity").setProperty("/endDateLocale", endDateLocale);
			oStorage.remove("interval");
		},

		clearIntervalFunc: function () {
			var array = oStorage.get("interval");
			var intervalArray = JSON.parse(array);
			intervalArray.forEach(function (item) {
				clearInterval(item);
			})
		},

		// check if there is running timer and change the button type - used in the init method
		checkClockState: function (sChannelId, sEventId, oData) {
			this.hidePutTimeButton(oData)
			var button = this.byId("timerButton_activity");
			var pastTime = oStorage.get("pastTimeActivity");
			if (pastTime !== null) {
				var pastTimeObject = JSON.parse(pastTime);
				var stopped = pastTimeObject.stopped;
				if (stopped) {
					button.setType(sap.m.ButtonType.Ghost);
					button.setIcon('sap-icon://play');
					button.setText("Start");
					this.getModel("footerModel").setProperty("/showFooter", true);
					if (!this.hidePutTime) {
						this.getModel("footerModel").setProperty("/showPutTimeButton", true);
					}
					// oModel to show information about time in the UI
					var oModel = new JSONModel({
						startDateLocale: pastTimeObject.startDateLocale,
						endDateLocale: pastTimeObject.endDateLocale,
						time: pastTimeObject.duration,
						hours: pastTimeObject.hours,
						minutes: pastTimeObject.minutes
					});
					this.setModel(oModel, "pastTimeActivity");
				} else {
					this.startClock();
					button.setType(sap.m.ButtonType.Reject);
					button.setIcon('sap-icon://stop');
					button.setText("Stop");
				}
			} else {
				this.getModel("footerModel").setProperty("/showFooter", false);
				button.setType(sap.m.ButtonType.Ghost);
				button.setIcon('sap-icon://play');
				button.setText("Start")
			}
		},

		hidePutTimeButton: function (oData) {
			if (oData !== undefined && oData.hidePutTime === true) {
				this.hidePutTime = oData.hidePutTime;
				this.getModel("footerModel").setProperty("/showPutTimeButton", false)
			} else {
				this.hidePutTime = false
			}
		},

		putTimeToProject: function () {
			var pastTime = this.getModel("pastTimeActivity");
			var hours = pastTime.getProperty("/hours");
			var minutes = pastTime.getProperty("/minutes");
			minutes = Math.ceil(minutes / 5) * 5;

			if (minutes === 0) {
				minutes = 5;
			}

			if (minutes < 10) {
				minutes = "0" + minutes
			}

			var oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			oEventBus.publish(
				"putValueFromTimerToInput", {
					hours,
					minutes
				}
			);

			oStorage.remove("pastTimeActivity");
			this.getModel("footerModel").setProperty("/showFooter", false);
			this.getModel("footerModel").setProperty("/showPutTimeButton", false);
		},

		/********************************************************************
		 *********************** Presence Timer ******************************
		 ********************************************************************/

		setModelForHome: function (model, modelName) {
			var oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			oEventBus.publish(
				"setModelFromTimer", {
					model,
					modelName
				}
			);
		},

		setModelForTimer: function (sChannelId, sEventId, oData) {
			this.setModel(oData.model, oData.name);
		},

		startPresenceClock: function (sChannelId, sEventId, oData) {
			if (oData.workTime !== undefined) {
				var workTime = oData.workTime;
				var oModel = new JSONModel({
					time: oData.workTime
				});
				sap.ui.getCore().setModel(oModel, "workTime");
			} else {
				var workTime = sap.ui.getCore().getModel("workTime").getProperty("/time");
			}

			var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);
			var pastTime = oStorage.get("pastTime");
			if (pastTime !== null) {
				this.isKommenSelected = true;
				// use this for showing the remaining time
				var pastTimeObject = JSON.parse(pastTime);
				var startStamp = pastTimeObject.startStamp;

				// get hours and minutes from storage and set the model for kommen model - use it as value on kommen field
				var hour = pastTimeObject.startHour;
				var minute = pastTimeObject.startMinute;
				var oModel = new JSONModel({
					date: new Date(pastTimeObject.startStamp),
					time: hour + ":" + minute
				})

				this.setModelForHome(oModel, "kommenModel");

				if (workTime !== undefined && workTime !== 0) {
					var time = workTime.toString().split('.')
					var minutes = time[1];
					var stringMinutes = '0.' + minutes;
					var floatMinutes = parseFloat(stringMinutes);
					var realMinutes = floatMinutes * 60;
					var realHours = time[0];
					var date = new Date(startStamp);
					date.setHours(realHours, realMinutes);
					var start = date.getTime();
					var startDate = new Date(startStamp);
					startDate.setHours(startDate.getHours() - realHours, startDate.getMinutes() - realMinutes);
					startStamp = startDate.getTime();
				}

				interval = setInterval(() => {
					this.updatePresenceClock(startStamp);
				}, 1000);

				this.setIntervalToLocalStorage(interval)

			}
		},

		updatePresenceClock: function (startStamp) {
			let newDate = new Date();
			let newStamp = newDate.getTime();
			let start;

			if (this.startStamp === undefined) {
				start = startStamp;
			} else {
				start = this.startStamp;
			}

			let diff = Math.round((newStamp - start) / 1000);

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

			var oModel = new JSONModel({
				time: h + ":" + m + ":" + s
			})

			this.setModel(oModel, "pastTime");
			this.setModelForHome(oModel, "pastTime");
		},

		stopPresenceClock: function () {
			var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);
			oStorage.remove("pastTime");
			clearInterval(interval);
		},

		hideTimer: function (sChannelId, sEventId, oData) {
			if (oData.hide) {
				this.getModel("footerModel").setProperty("/showDayTimer", false);
				this.getModel("footerModel").setProperty("/showWorkTime", true);
			} else {
				this.getModel("footerModel").setProperty("/showDayTimer", true);
				this.getModel("footerModel").setProperty("/showWorkTime", false);
			}

		},
		
		// Helper functions 
		
		setIntervalToLocalStorage: function (interval) {
			var localIntervals = oStorage.get("interval");

				if (localIntervals === null) {
					var intervallArray = [];
					intervallArray.push(interval);
					oStorage.put("interval", JSON.stringify(intervallArray));
				} else {
					var array = JSON.parse(localIntervals)
					array.push(interval);
					oStorage.put("interval", JSON.stringify(array));
				}
		}

	});
});