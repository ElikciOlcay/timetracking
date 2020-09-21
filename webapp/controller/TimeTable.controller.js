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
	'../service/zammad/zammadService'
], function (BaseController, JSONModel, Device, formatter, Filter, FilterOperator, MessageBox, MessageToast, CalendarLegendItem,
	DateTypeRange, Table, queries, zammadService) {
	"use strict";

	return BaseController.extend("Zeiterfassung.controller.TimeTable", {

		formatter: formatter,

		onInit: function () {

			this.userId = sap.ui.getCore().getModel("user").getProperty("/id");
			this.persNr = sap.ui.getCore().getModel("user").getProperty("/persNr");
			this.projectIsInDb = false;

			this.initialState = true;
			this.oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			this.oEventBus.subscribe(
				"setModelFromZammadService",
				this.setModelFromZammadService,
				this
			);

			this.oEventBus.subscribe(
				"calculateTotalWorkTimeforDay",
				this._calculateTotalWorkTimeforDay,
				this
			);

			this.oEventBus.subscribe(
				"calculateTotalActivityTimeforDay",
				this._calculateTotalActivityTimeforDay,
				this
			);

			this.oEventBus.subscribe(
				"onCalendarSelect",
				this.onCalendarSelect,
				this
			);

			this.oEventBus.subscribe(
				"setZammadButtonMode",
				this.setZammadButtonMode,
				this
			);
		},

		onAfterRendering: function () {
			this.userPersNrWithZeros = sap.ui.getCore().getModel("user").getProperty("/persNrWithZeros");
			this.date = new Date();
			this.filterTimeList();
			this._calculateTotalWorkTimeforDay();
			this._calculateTotalActivityTimeforDay();

		},

		setZammadButtonMode: function (sChannelId, sEventId, oData) {
			var oModel = new JSONModel({
				visible: oData.visible
			})
			this.setModel(oModel, "zammadButton");
		},

		setModelFromZammadService: function (sChannelId, sEventId, oData) {
			this.setModel(oData.model, "activityModel");
		},

		/* 
			set filter to times table
			@param {string} sUser: current user
		*/
		filterTimeList: function () {
			var oTimeList = this.byId("table").getBinding("items");
			var timeFilter = [];
			var sUser = this.userPersNrWithZeros;
			var date = this.date;
			var timestamp = this._convertDateToTimestamp(date);
			timeFilter.push(new Filter("Pernr", FilterOperator.EQ, sUser));
			timeFilter.push(new Filter("Datum", FilterOperator.EQ, timestamp));
			oTimeList.filter(timeFilter);
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

		_refreshOdata: function () {
			var oModel = this.getView().getModel();
			oModel.refresh(true);
		},

		_calculateTotalWorkTimeforDay: function (calendarSelected) {
			var self = this;
			setTimeout(function () {
				var oTable = self.byId("table");
				var aData = (oTable.getItems() || []).map(function (oItem) {
					return oItem.getBindingContext().getObject();
				});

				self.workTime = 0;

				for (var i = 0; i < aData.length; i++) {
					if (aData[i] !== undefined) {
						var total = parseFloat(aData[i].Dauer);
						self.workTime += total;
					}
				}

				self.getView().getModel("totalWorkTime").setProperty("/workTime", self.workTime.toString());

				// set model in timer controller
				var totalWorkTime = self.getModel("totalWorkTime");
				self.oEventBus.publish(
					"setModelForTimer", {
						model: totalWorkTime,
						name: "totalWorkTime"
					}
				);

				if (!calendarSelected) {
					self.startPresenceClock();
				}
			}, 1000);

		},

		_calculateTotalActivityTimeforDay: function (oData) {
			this.pushZammadService();
			var self = this;
			setTimeout(function () {
				self.initialState = false;
				var oTable = self.byId("table_activity");
				var aData = (oTable.getItems() || []).map(function (oItem) {
					return oItem.getBindingContext("activityModel").getObject();
				});
				var activityTime = 0;

				for (var i = 0; i < aData.length; i++) {
					if (aData[i] !== undefined) {
						var total = parseFloat(aData[i].Duration);
						activityTime += total;
					}
				}

				var hoursText = "Stunde";
				if (activityTime > 1 || activityTime === 0) {
					hoursText = "Stunden";
				}

				self.getView().getModel("totalWorkTime").setProperty("/activityTime", activityTime.toString());
				var totalWorkTime = self.getModel("totalWorkTime");
				self.oEventBus.publish(
					"setModelForTimer", {
						model: totalWorkTime,
						name: "totalWorkTime"
					}
				);
			}, 2000);
		},

		startPresenceClock: function () {
			// use event bus to call checkClockstate from timer controller
			this.oEventBus.publish(
				"startPresenceClock", {
					workTime: this.workTime
				}
			);
		},

		destroySpecialDate: function () {
			this.oEventBus.publish(
				"destroySpecialDate"
			);
		},

		stopPresenceClock: function () {
			this.oEventBus.publish(
				"stopPresenceClock"
			);
		},

		// delete worktime
		onDeleteTime: function (oEvent) {
			// basecontroller
			this.onDeleteEntry(oEvent, false);
			this.destroySpecialDate(oEvent);
			this._calculateTotalWorkTimeforDay();
			this.stopPresenceClock();
		},

		// delete activitytime
		onDeleteActivityTime: function (oEvent) {
			// basecontroller
			this.onDeleteEntry(oEvent, true);
			this.destroySpecialDate(oEvent);
			this._calculateTotalActivityTimeforDay(false);
			this.stopPresenceClock();
		},

		pushZammadService: function () {
			zammadService.getOrderItemSet(this.getView().getModel(), this.getView(), this.date, this.userPersNrWithZeros);
		},

		onCalendarSelect: function (sChannelId, sEventId, oData) {
			this.removeActivityModel();
			this.date = oData.date;
			this.filterTimeList();
			this.pushZammadService();
			this._calculateTotalWorkTimeforDay(true);
			this._calculateTotalActivityTimeforDay(false);
		},

		reloadTimeList: function () {
			this.removeActivityModel();
			this.pushZammadService();
			this._calculateTotalWorkTimeforDay(true);
			this._calculateTotalActivityTimeforDay(false);
		},

		removeActivityModel: function () {
			var oModel = this.getModel("activityModel");
			if (oModel !== undefined) {
				oModel.destroy();
			}
			this.byId("table_activity").getBinding("items").refresh();
		},

		onShowTimeDetailDialog: function (oEvent) {
			this.showDialog(oEvent);
		},

		pushZammadEntriesInSapDb: async function () {
			var self = this;
			var oTable = this.byId("table_activity");
			var aData = (oTable.getItems() || []).map(function (oItem) {
				return oItem.getBindingContext("activityModel").getObject();
			});

			for (var i = 0; i < aData.length; i++) {
				if (aData[i].isNew === true) {
					// if zammad entry is not in sap db, push it.
					var isInDb = await this.checkIsZammadInDb(aData[i].id);
					if (!isInDb) {
						var zammadObject = {
							ticket_id: aData[i].ticket_id,
							projectTitle: aData[i].ProjectTitle
						}
						await this.getProjectsFromDb(zammadObject);
						this.projectIsInDb = false;
						var selectedDate = this.date;
						var dateFormat = sap.ui.core.format.DateFormat.getDateInstance({
							pattern: "YYYY-MM-ddTHH:mm:ss"
						});
						var formattedDate = dateFormat.format(selectedDate);
						var oModel = this.getView().getModel();
						var oEntry = {};
						oEntry.EmployeeId = this.persNr.toString();
						oEntry.Datum = formattedDate;
						oEntry.Duration = aData[i].Duration.toString();
						oEntry.ActivityTitle = aData[i].ActivityTitle;
						oEntry.ProjectTitle = aData[i].ProjectTitle;
						//oEntry.ActivityType = this.activityType;
						oEntry.Description = aData[i].Description;
						oEntry.ParentKey = this.ParentKey;
						oEntry.OrderType = "2000";
						oEntry.ExternalId = aData[i].id.toString();
						oModel.setHeaders({
							"content-type": "application/json",
							"method": "POST",
							"charset": "utf-8",
							"X-CSRF-Token": "Sy20dYnUW2c22JGDMqhZHg=="
						});

						oModel.create('/OrderItemSet', oEntry, {
							success: function (oData, oResponse) {
								// Success 
								self.pushZammadService();
								MessageToast.show("Zammad Einträge wurden gespeichert");
							},
							error: function (oError) {
								// Error 
								var errorMessage = ("Zammad Einträge konnten nicht gespeichert werden");
								sap.m.MessageBox.error(errorMessage, {
									title: "Fehler",
									initialFocus: null
								});
							}
						});
					}
				}
			}
		},

		checkIsZammadInDb: function (zammadId) {
			return new Promise((resolve, reject) => {
				var oModel = this.getView().getModel();
				var timeStamp = this._convertDateToTimestamp(this.date);
				var filters;
				filters = new Filter({
					filters: [
						new Filter("EmployeeId", FilterOperator.EQ, this.persNr),
						new Filter("Datum", FilterOperator.EQ, timeStamp),
					],
					and: true,
				});
				oModel.read("/OrderItemSet", {
					filters: filters.aFilters,
					success: function (response, oData) {
						//response will have the return of the request
						var isInDb = false;
						if (response.results.length > 0) {
							response.results.forEach(function (item) {
								if (item.OnePointId === zammadId.toString()) {
									isInDb = true;
								}
							})
						}

						resolve(isInDb);
					},
					error: function (e) {
						reject(console.log(e));
					}
				});
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

		getProjectsFromDb: function (zammadObject) {
			return new Promise((resolve, reject) => {
				var oModel = this.getView().getModel();
				var self = this;
				var dataLoaded = oModel.read("/OrderSet", {
					success: async function (response, oData) {
						//response will have the return of the request
						await self.getIsProjectInDb(response, zammadObject);
						resolve();
					},
					error: function (e) {
						reject(console.log(e));
					}
				});
			})
		},

		getIsProjectInDb: async function (project, zammadObject) {
			var self = this;
			return new Promise((resolve, reject) => {
				var projectArray = project.results;
				var currentProjectId = zammadObject.ticket_id;
				var currentProjectTitle = zammadObject.projectTitle;
				for (var i = 0; i < projectArray.length; i++) {
					if (projectArray[i].ExternalId === currentProjectId.toString()) {
						self.projectIsInDb = true;
						self.parentKey = projectArray[i].DbKey;
						resolve();
						break;
					}
				}
				if (self.projectIsInDb === false) {
					const init = async() => {
						await self.initProjectinDb(currentProjectId, currentProjectTitle);
						self.projectIsInDb = false;
						resolve();
					}
					init();
				}
			})
		},

		initProjectinDb: function (currentProjectId, currentProjectTitle) {
			return new Promise((resolve, reject) => {
				var oModel = this.getView().getModel();
				var oEntry = {};
				var self = this;
				oEntry.OrderTyp = "2000";
				oEntry.ExternalId = currentProjectId.toString();
				oEntry.Description = currentProjectTitle;

				oModel.setHeaders({
					"content-type": "application/json",
					"method": "POST",
					"charset": "utf-8",
					"X-CSRF-Token": "Sy20dYnUW2c22JGDMqhZHg=="
				});
				oModel.create('/OrderSet', oEntry, {
					success: function (oData, oResponse) {
						self.parentKey = oData.DbKey;
						resolve();
					},
					error: function (oError) {
						reject(console.log(oError));
					}
				});
			})
		},
	});
});