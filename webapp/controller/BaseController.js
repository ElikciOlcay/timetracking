sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/MessageBox",
	'sap/m/MessageToast',
	'Zeiterfassung/service/onepoint/queries',
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	'sap/ui/model/json/JSONModel',
	'Zeiterfassung/model/formatter',
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/Text",
	"sap/m/FlexBox"
], function (Controller, UIComponent, MessageBox, MessageToast, queries, Filter, FilterOperator, JSONModel, formatter, Dialog, Button,
	Text, FlexBox) {
	"use strict";

	this.interval;

	return Controller.extend("Zeiterfassung.controller.BaseController", {
		formatter: formatter,

		onInit: function () {

		},

		setPageModel: function (pageNr, context) {
			sap.ui.getCore().getModel("pageModel").setProperty("/pageId", pageNr);
			sap.ui.getCore().getModel("pageModel").setProperty("/context", context);
		},

		/**
		 * Convenience method for accessing the router.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		/**
		 * Convenience method for getting the view model by name.
		 * @public
		 * @param {string} [sName] the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.mvc.View} the view instance
		 */
		setModel: function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/*
			@param{oEvent}
			@param{isProjectsPage} if function is called from project page (Detail.controller) value is true
		*/
		onDeleteEntry: function (oEvent, isActivity) {
			var pageId = sap.ui.getCore().getModel("pageModel").getProperty("/pageId");
			var context = sap.ui.getCore().getModel("pageModel").getProperty("/context");
			var isProjectsPage = (pageId === 1) ? true : false;
			var path;
			var timeObject;
			if (isActivity) {
				timeObject = oEvent.getParameter('listItem').getBindingContext("activityModel").getObject();
				var dbKey = timeObject.DbKey;
				var parrentKey = timeObject.ParentKey;
				path = `/OrderItemSet(DbKey=guid'${dbKey}',ParentKey=guid'${parrentKey}')`
			} else {
				path = oEvent.getParameter('listItem').getBindingContext().getPath();
				timeObject = oEvent.getParameter('listItem').getBindingContext().getObject();
			}

			if (timeObject.OrderType === "2000") {
				var errorMessage = "Zammad Stunden können nicht gelöscht werden! Bitte korrigiere die Zeit in der Zammad App"
				sap.m.MessageBox.error(errorMessage, {
					title: "Achtung",
					initialFocus: null
				});
			} else {
				var isOnePoint = (timeObject.OnePointId === "0" || timeObject.OnePointId === undefined) ? false : true;
				var oModel = this.getView().getModel();
				var self = this;
				oModel.setHeaders({
					"content-type": "application/json",
					"method": "DELETE",
					"charset": "utf-8"
				});
				oModel.remove(path, {
					success: function (oData, oResponse) {
						// Success
						if (isOnePoint) {
							self.deleteTimeRecordFromOnePoint(timeObject, timeObject.OnePointId, false, null, isProjectsPage, context);
							if (isProjectsPage) {
								self.oEventBus.publish("getProjectAssignment", {
									assignmentId: context.assignmentId
								});
							}
						} else {
							MessageToast.show("Zeit wurde gelöscht");
						}
						oModel.refresh(true, true);
					},
					error: function (oError) {
						var error = JSON.parse(oError.responseText);
						var errorMessage = error.error.message.value
						if (errorMessage !== undefined) {
							sap.m.MessageBox.error(errorMessage, {
								title: "Fehler",
								initialFocus: null
							});
						} else {
							var errorMessage = ("Zeit konnte nicht gelöscht werden");
							sap.m.MessageBox.error(errorMessage, {
								title: "Fehler",
								initialFocus: null
							});
						}

					}
				});
			}

		},

		// delete timerecord from onepoint
		deleteTimeRecordFromOnePoint: function (timeObject, timeRecordId, isError, errorMessage, isProjectsPage, context) {
			this.token = queries.getToken();
			var myHeaders = new Headers();
			var onePointId = timeRecordId;
			var self = this;
			myHeaders.append("Content-Type", "application/json");
			myHeaders.append("Accept", "application/json");
			myHeaders.append("Authorization", `Bearer ${this.token}`);

			var raw = "";

			var requestOptions = {
				method: 'DELETE',
				headers: myHeaders,
				body: raw,
			};

			fetch(`https://europe.onepoint-projects.com/api/json/v2//worklogs/deleteWorkRecord/${onePointId}`, requestOptions)
				.then(function (response) {
					if (response.ok) {
						// if entry was deleted because of an error on sap side, then show different message
						if (isError) {
							MessageBox.error(errorMessage.responseText, {
								title: "Fehler",
								initialFocus: null
							});
						} else {
							MessageToast.show("Zeit wurde gelöscht");
						}
						// if delete is called from projects page call these functions
						if (isProjectsPage) {
							context.getProjectActivity(context.activityID);
							context.getProjectPlan(context.projectId);
						}
					} else {
						// restore deleted time entry from sap db
						context.restoreEntry(timeObject);
						return Promise.reject(response);
					}
				})
				.catch(error => {
					MessageToast.show("Zeit konnte nicht gelöscht werden");
					console.log(error);
				});
		},

		// check month is completed
		isMonthCompleted: function () {
			var calendar = this.byId("calendar");
			var selectedDate = calendar.getStartDate();
			var year = selectedDate.getFullYear().toString();

			var month = selectedDate.getMonth() + 1;
			var previousMonth = month - 1;

			var convertedMonth = month.toString().padStart(2, '0');
			var convertedMonthPrev = previousMonth.toString().padStart(2, '0');

			var self = this;
			var filters = [];

			var selectedMonthObject = {
				year: year,
				month: convertedMonth,
				id: "selected"
			};

			var previousMonthObject = {
				year: year,
				month: convertedMonthPrev,
				id: "prev"
			};

			var months = [selectedMonthObject, previousMonthObject];

			months.forEach((item, index) => {

				var filters = new Filter({
					filters: [
						new Filter("EmployeeId", FilterOperator.EQ, this.userPersNrWithZeros),
						new Filter("Ryear", FilterOperator.EQ, item.year),
						new Filter("Rmonth", FilterOperator.EQ, item.month)
					],
					and: true,
				});

				var oModel = this.getView().getModel();

				oModel.read(`/MonthlyReleaseSet`, {
					filters: filters.aFilters,
					success: function (oResponse, oData) {
						var results = oResponse.results;
						self.monthIsReleased = false;
						var month;
						var year;
						var dbKey;
						if (results.length !== 0) {
							if (results[0].Released) {
								self.monthIsReleased = true
								month = results[0].Rmonth;
								year = results[0].Ryear;
							}
							dbKey = results[0].DbKey;
						}

						var oModel = new JSONModel({
							monthIsReleased: self.monthIsReleased,
							month: month,
							year: year,
							dbKey: dbKey
						});

						if (item.id === "selected") {
							self.setModel(oModel, "monthIsReleased");
						} else if (item.id === "prev") {
							self.setModel(oModel, "prevMonthIsReleased");
						}
					},
					error: function (oError) {
						console.log(oError)
					}
				});
			});
		},

		completeMonth: function () {
			var calendar = this.byId("calendar");
			var selectedDate = calendar.getStartDate();
			selectedDate.setMonth(selectedDate.getMonth() - 1);
			var year = selectedDate.getFullYear().toString();
			var month = selectedDate.getMonth() + 1;
			var convertedMonth = month.toString().padStart(2, '0');
			var dbKey = this.getModel("prevMonthIsReleased").getProperty("/dbKey");
			var self = this;

			var oModel = this.getView().getModel();
			var oEntry = {};
			oEntry.Released = true
			oModel.setHeaders({
				"content-type": "application/json",
				"method": "PUT",
				"charset": "utf-8",
			});

			oModel.update(`/MonthlyReleaseSet(guid'${dbKey}')`, oEntry, {
				success: function (oData, oResponse) {
					// Success
					self.isMonthCompleted();
					MessageToast.show(formatter.dateToString(month, year) + " wurde abgeschlossen");
				},
				error: function (oError) {
					// Error 
					MessageToast.show("Monat konnte nicht abgeschlossen werden");
				}
			});
		},

		unlockMonth: function () {
			var calendar = this.byId("calendar");
			var selectedDate = calendar.getStartDate();
			var year = selectedDate.getFullYear().toString();
			var month = selectedDate.getMonth() + 1;
			var convertedMonth = month.toString().padStart(2, '0');
			var dbKey = this.getModel("monthIsReleased").getProperty("/dbKey");
			var self = this;

			var oModel = this.getView().getModel();
			var oEntry = {};
			oEntry.Released = false
			oModel.setHeaders({
				"content-type": "application/json",
				"method": "PUT",
				"charset": "utf-8",
			});

			oModel.update(`/MonthlyReleaseSet(guid'${dbKey}')`, oEntry, {
				success: function (oData, oResponse) {
					// Success
					self.isMonthCompleted();
					MessageToast.show("Month activated");
				},
				error: function (oError) {
					// Error 
					MessageToast.show("Month could not be activated");
				}
			});
		},

		getFavoriteActivities: function () {
			this.token = queries.getToken();
			return new Promise((resolve, reject) => {
				var favorites = this.getFavoriteProjects();
				if (favorites !== null && favorites !== undefined) {
					var query = queries.getOnePointActivity(this.userId);
					const request = async() => {
						const response = await fetch('https://europe.onepoint-projects.com/api/v3', {
							method: 'POST',
							headers: {
								"Authorization": `Bearer ${this.token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								query,
							})
						}).catch(function (error) {
							reject(console.log(error));
						})

						const json = await response.json();
						let rawData = json.data.resource.assignments;
						let favoriteActivities = [];

						favorites.forEach(function (itemLocal) {
							rawData.forEach(function (raw) {
								if (itemLocal === raw.id) {
									favoriteActivities.push(raw);
								}
							})
						})

						resolve(favoriteActivities);
					}
					request();
				}

			})

		},

		getFavoriteOtherActivites: function () {
			var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);
			var self = this;
			var activitiesLocal = oStorage.get("otherActivities");
			if (activitiesLocal !== null) {
				var oModel = new JSONModel(JSON.parse(activitiesLocal));
				return oModel;
			}
		},

		getFavoriteProjects: function () {
			var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);
			var self = this;
			var activitiesLocal = oStorage.get("activities");
			if (activitiesLocal !== null) {
				return JSON.parse(activitiesLocal);
			} else {
				return null;
			}
		},

		showDialog: function (oEvent) {
			var timeObject = oEvent.getParameter('listItem').getBindingContext("activityModel").getObject();
			this.fixedSizeDialog = new Dialog({
				title: "Details zur Zeitbuchung",
				contentWidth: "350px",
				contentHeight: "100px",
				content: new FlexBox({
					height: '100px',
					justifyContent: sap.m.FlexJustifyContent.Center,
					alignItems: sap.m.FlexAlignItems.Center,
					items: new Text({
						text: oEvent.getParameter('listItem').getBindingContext("activityModel").getObject().Description
					})
				}),
				endButton: new Button({
					text: "schließen",
					press: function () {
						this.fixedSizeDialog.close();
					}.bind(this)
				})
			});

			this.fixedSizeDialog.open();
		},

		calendarSelect: function (oEvent, todayButtonSelected, selectedDate) {
			if (todayButtonSelected) {
				this.date = new Date();
			} else if (selectedDate) {
				this.date = selectedDate;
			} else {
				var selectedDate = oEvent.getSource().getSelectedDates();
				var oDate = selectedDate[0].getStartDate();
				this.date = oDate;
			}

			// call in TimeTable.controller.js
			this.oEventBus.publish("onCalendarSelect", {
				date: this.date
			});

			this.isMonthCompleted();
			this.setSelectedDate(this.date);

			// if selected date is not today, hide the timer and show "erfasste anwesenheit"
			var today = new Date();
			if (today.getDate() == this.date.getDate() && today.getMonth() == this.date.getMonth() && today.getFullYear() == this.date.getFullYear()) {
				this.oEventBus.publish(
					"hideTimer", {
						hide: false
					}
				);
			} else {
				this.oEventBus.publish(
					"hideTimer", {
						hide: true
					}
				);
			}

		},

		setSelectedDate: function (d) {
			var date = d ? d : new Date();
			var oModel = new JSONModel({
				date
			});

			sap.ui.getCore().setModel(oModel, "selectedDate");
		}

	});

});