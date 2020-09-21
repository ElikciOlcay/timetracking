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
], function (BaseController, MessageToast, JSONModel, formatter, queries, MessageBox, Filter, FilterOperator,
	CalendarLegendItem, DateTypeRange, DateRange) {
	"use strict";

	var oStorage = jQuery.sap.storage(jQuery.sap.storage.Type.local);

	return BaseController.extend("Zeiterfassung.controller.projects.Detail", {
		formatter: formatter,

		onInit: function () {
			this.userId = sap.ui.getCore().getModel("user").getProperty("/id");
			this.persNr = sap.ui.getCore().getModel("user").getProperty("/persNr");
			this.userPersNrWithZeros = sap.ui.getCore().getModel("user").getProperty("/persNrWithZeros");
			this.durationSelected = false;
			this.activityTypeSelected = false;
			this.descSelected = false;
			this.openEffortSelected = true;
			this.date = new Date();
			this.activityCompleted = false

			// clear inputs on objectmatched - if nav from timer stop button, set it to false
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.getRoute("detail").attachPatternMatched(this._onObjectMatched, this);

			// model for total work time for selected date
			var totalTime = new JSONModel({
				workTime: 0,
				activityTime: 0
			});
			this.getView().setModel(totalTime, "totalWorkTime");

			var busyModel = new JSONModel({
				busy: false
			})

			this.getView().setModel(busyModel, "busy");
			this.token = queries.getToken();

			var hiddenModel = new JSONModel({
				noProject: true,
				page: false,
			});

			this.setModel(hiddenModel, "hiddenModel");
			this.createCalLengd();

			this.oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			this.oEventBus.subscribe(
				"setCalendarDate",
				this.setCalendarDate,
				this
			);

			this.oEventBus.subscribe(
				"getProjectAssignment",
				this.callProjectAssignmentFromTimeTable,
				this
			);
		},

		callProjectAssignmentFromTimeTable: function (sChannelId, sEventId, oData) {
			this.getProjectAssignment(oData.assignmentId);
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
			this.setPageModel(1, this);
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
			this.clearInputs();
			var hoursWorked = sap.ui.getCore().getModel("hoursWorked");
			if (hoursWorked !== undefined || hoursWorked !== null) {
				this.setModel(hoursWorked, "hoursWorked");
			}
			this.isMonthCompleted();
			this.getModel("hiddenModel").setProperty("/noProject", false);
			this.getModel("hiddenModel").setProperty("/page", true);
			this.getView().getModel("busy").setProperty("/busy", true);
			this.activityID = oEvent.getParameter("arguments").activityId;
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
				});

				const json = await response.json();
				let rawData = json.data.resource.assignments;
				let selectedProject;
				for (var i = 0; i < rawData.length; i++) {
					if (rawData[i].activity.id === this.activityID) {
						selectedProject = rawData[i];
						break;
					}
				}

				let oModel = new JSONModel(selectedProject);
				this.setModel(oModel, "project");
				var assignments = new JSONModel(selectedProject.activity.aggregatedAssignedResources);
				var showCompleteCheckbox = true;
				var multipleUser = false;
				if (selectedProject.activity.aggregatedAssignedResources.length > 1) {
					showCompleteCheckbox = false;
					multipleUser = true;
				}
				var assignmentsCount = new JSONModel({
					count: selectedProject.activity.aggregatedAssignedResources.length,
					showCompleteCheckbox,
					multipleUser
				});

				this.setModel(assignments, "assignments");
				this.setModel(assignmentsCount, "assignmentsCount");

				this.getProjectsFromDb();
				this.projectIsInDb = false;
				this.activityName = selectedProject.activity.name;
				this.projectId = selectedProject.activity.projectPlan.project.id;
				this.activityId = selectedProject.activity.id;
				this.assignmentId = selectedProject.id;
				this.getCompleteProject(this.projectId);
				this.getProjectPlan(this.projectId);
				this.getProjectAssignment(this.assignmentId);
				this.getProjectActivity(this.activityID);
				this.isFavorite();
			}
			request();
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

		errorMessage: function (error) {
			console.log(error);
			var bCompact = !!this.getView().$().closest(".sapUiSizeCompact").length;
			MessageBox.alert(
				"Zeit konnte nicht im OnePoint gespeichert werden", {
					styleClass: bCompact ? "sapUiSizeCompact" : ""
				}
			);
		},

		isFavorite: function () {
			var oModel = new JSONModel({
				isFavorite: false
			});
			this.setModel(oModel, "favoriteModel");

			var self = this;
			var activitiesLocal = oStorage.get("activities");
			if (activitiesLocal !== null) {
				var activitiesLocalArray = JSON.parse(activitiesLocal);
				activitiesLocalArray.forEach(function (item) {
					var favButton = self.byId("buttonFav");
					if (item === self.assignmentId) {
						self.getModel("favoriteModel").setProperty("/isFavorite", true)
					}
				})
			}
		},

		onShowTimeDetailDialog: function (oEvent) {
			this.showDialog(oEvent);
		},

		onAddFavorite: function (oEvent) {
			var pressed = oEvent.getSource().getPressed();
			var self = this;
			var activitiesLocal = oStorage.get("activities");

			if (pressed === true) {
				if (activitiesLocal === null) {
					var activities = [];
					activities.push(this.assignmentId);
					oStorage.put("activities", JSON.stringify(activities));
				} else {
					var activitiesLocalArray = JSON.parse(activitiesLocal);
					activitiesLocalArray.push(this.assignmentId);
					oStorage.put("activities", JSON.stringify(activitiesLocalArray));
				}
			} else {
				var activitiesLocalArray = JSON.parse(activitiesLocal);
				activitiesLocalArray.forEach(function (item, index) {
					if (item === self.assignmentId) {
						activitiesLocalArray.splice(index, 1);
					}
				})
				oStorage.put("activities", JSON.stringify(activitiesLocalArray));
			}
		},

		// get project from v2 API 
		getCompleteProject: function (projectId) {
			const request = async() => {
				const response = await fetch(`https://europe.onepoint-projects.com/api/json/v2/projects/getProjectById/${projectId}`, {
					method: 'GET',
					headers: {
						"Authorization": `Bearer ${this.token}`,
						"Content-Type": "application/json",
					}
				});

				const json = await response.json();
				var completeProject = new JSONModel(json);
				this.setModel(completeProject, "completeProject");
			}
			request();
		},

		// get timerecords for project
		getProjectPlan: function (projectId) {
			this.getView().getModel("busy").setProperty("/busy", true);
			const request = async() => {
				const response = await fetch(`https://europe.onepoint-projects.com/api/json/v2/projects/getPlanForProject/${projectId}`, {
					method: 'GET',
					headers: {
						"Authorization": `Bearer ${this.token}`,
						"Content-Type": "application/json",
					}
				});

				const json = await response.json();
				var projectPlan = new JSONModel(json);
				this.setModel(projectPlan, "projectPlan");
			}
			request();
		},

		getProjectActivity: function (activityId) {
			this.getView().getModel("busy").setProperty("/busy", true);
			const request = async() => {
				const response = await fetch(`https://europe.onepoint-projects.com/api/json/v2/tasks/getTaskById/${activityId}`, {
					method: 'GET',
					headers: {
						"Authorization": `Bearer ${this.token}`,
						"Content-Type": "application/json",
					}
				}).catch(function (error) {
					console.log(error);
				});

				const json = await response.json();
				this.calculateExpectedEffort(json.baseEffort, json.effortVariances);

				var projectPlan = new JSONModel(json);
				this.setModel(projectPlan, "projectActivity");
				this.getView().getModel("busy").setProperty("/busy", false);
				this.checkAcivityOwner(json.responsibleResource);

			}
			request();
		},

		checkAcivityOwner: function (responsibleResourceId) {
			var isOwner = false;
			if (this.userId === responsibleResourceId) {
				isOwner = true
			}
			var ownerModel = new JSONModel({
				isOwner
			});

			this.setModel(ownerModel, "ownerModel");

		},

		getProjectAssignment: function (assignmentId) {
			const request = async() => {
				const response = await fetch(
					`https://europe.onepoint-projects.com/api/json/v2/tasks/getAssignmentsByIds?assignmentIds=${assignmentId}`, {
						method: 'GET',
						headers: {
							"Authorization": `Bearer ${this.token}`,
							"Content-Type": "application/json",
						}
					}).catch(function (error) {
					console.log(error);
				});

				const json = await response.json();
				var projectAssignment = new JSONModel(json.assignment[0]);
				this.setModel(projectAssignment, "projectAssignment");
				this.getActivityWorkRecord();
			}
			request();
		},

		getActivityWorkRecord: function () {
			var query = queries.getActivityWorkRecord(this.activityId, this.userId);

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
				}).catch(error => {
					console.log(error)
				});

				const json = await response.json();
				let workRecords = json.data.workRecords;
				var actualEffort = 0;
				workRecords.forEach(function (record) {
					actualEffort += record.actualEffort;
				});

				var baseEffort = this.getModel("projectAssignment").getProperty("/baseEffort");
				var openEffort = baseEffort - actualEffort;

				var activityWorkRecord = new JSONModel({
					actualEffort,
					openEffort
				})
				this.setModel(activityWorkRecord, "activityWorkRecord");

			}

			request();

		},

		/*_navToActivity: function () {
			var pastTimeActivity = oStorage.get("pastTimeActivity");
			var pastTimeObject = JSON.parse(pastTimeActivity);
			var activityType = pastTimeObject.activityType;
			var activityId = pastTimeObject.activityId;
			var oRouter = this.getOwnerComponent().getRouter();
			if (activityType === "project") {
				var activityId = pastTimeObject.activityId;
				oRouter.navTo("detail", {
					activityId
				});
			} else if (activityType === "others") {
				var type = pastTimeObject.type;
				var typesub = pastTimeObject.typeSub;
				var oModel = new JSONModel(pastTimeObject.selectedProject);
				sap.ui.getCore().setModel(oModel, "selectedProject");
				oRouter.navTo("detailOthers", {
					type: type,
					typesub: typesub
				});
			}
		},*/

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

		setActivityType: function (oEvent) {
			if (oEvent.getSource().getSelectedItem() !== null) {
				this.activityType = oEvent.getSource().getSelectedItem().getText();
				this.activityTypeSelected = true;
			} else {
				this.activityTypeSelected = false;
			}
		},

		putTimeToProject: function (sChannelId, sEventId, oData) {
			debugger
			var oModel = new JSONModel({
				time: oData.hours + ":" + oData.minutes
			})

			this.setModel(oModel, "hoursWorked");
			this.setWorkDuration(null, true);
		},

		setWorkDuration: function (oEvent, timer) {
			var duration;
			if (timer) {
				duration = this.byId("inputTime").getValue();
			} else {
				duration = oEvent.getParameter("value");
			}
			if (duration !== null) {
				var hoursToMinues = duration.slice(0, 2) * 60;
				var minutes = duration.slice(3, 5);
				var hoursToMinuesInt = parseFloat(hoursToMinues);
				var minutesInt = parseFloat(minutes);
				var totalDuration = hoursToMinuesInt + minutesInt;
				this.duration = (totalDuration / 60).toString();
				this.durationSelected = true
			} else {
				this.durationSelected = false;
			}
			this.calculateOpenEffort();
		},

		setDescription: function (oEvent) {
			this.desc = oEvent.getSource().getValue();
			if (this.desc !== null) {
				this.descSelected = true;
			} else {
				this.descSelected = false;
			}
		},

		setOpenEffort: function (oEvent) {
			this.openEffort = oEvent.getSource().getValue();
			if (this.openEffort !== null) {
				this.effortAfterBooking = this.openEffort;
				this.openEffortSelected = true;
			} else {
				this.openEffortSelected = false;
			}
		},

		calculateOpenEffort: function () {
			var bookingDuration = this.duration;
			var openEffortBeforeBooking = this.getModel("projectActivity").getProperty("/openEffort");
			this.effortAfterBooking = openEffortBeforeBooking - bookingDuration
				//var convertedTime = this.decimalHoursToTime(effortAfterBooking.toString());
			var oModel = new JSONModel({
				effortAfterBooking: this.effortAfterBooking.toFixed(2)
			});
			this.setModel(oModel, "effortAfterBooking");
		},

		decimalHoursToTime: function (hours) {
			var decimalHours = hours.substr(0, hours.indexOf('.'));
			var decimalMinutes = '0.' + hours.split('.')[1];
			var minutes = Math.round(decimalMinutes * 60);
			var hoursWithZero = decimalHours.padStart(2, '0');
			return hoursWithZero + ":" + minutes;
		},

		validateInputs: function () {
			if (this.durationSelected && this.descSelected && this.openEffortSelected) {
				return true;
			} else {
				return false;
			}
		},

		completeActivity: function (oEvent) {
			var selected = oEvent.getSource().getSelected();
			this.activityCompleted = selected;
		},

		createTimeRecord: function () {
			var myHeaders = new Headers();
			var activityId = this.getModel("project").getProperty("/id");
			var actualEffort = this.duration;
			var desc = this.desc;
			var open = this.effortAfterBooking.toString();
			var dateString = this.date.getFullYear() + "-" + ('0' + (this.date.getMonth() + 1)).slice(-2) + "-" + ('0' + this.date.getDate()).slice(-
				2) + "Z";
			myHeaders.append("Content-Type", "application/json");
			myHeaders.append("Accept", "application/json");
			myHeaders.append("Authorization", `Bearer ${this.token}`);

			var raw = "";

			var requestOptions = {
				method: 'POST',
				headers: myHeaders,
				redirect: 'follow'
			};

			if (this.validateInputs()) {
				fetch(
						`https://europe.onepoint-projects.com/api/json/v2/worklogs/createWorkRecord
						/${activityId}?bookingDate=${dateString}&bookingResourceId=${this.userId}&actualEffort=${actualEffort}&comment=${desc}&open=${open}&completed=${this.activityCompleted}`,
						requestOptions)
					.then(function (response) {
						if (response.ok) {
							return response.text();
						} else {
							return Promise.reject(response);
						}
					})
					.then(result => {
						this.onCreateEntry(JSON.parse(result));
						this.getProjectActivity(this.activityID);
						this.getProjectPlan(this.projectId);
						this.getProjectAssignment(this.assignmentId);
						// if completed, reload page
						if (this.activityCompleted) {
							this.reloadPage();
						}
					})
					.catch(error => this.errorMessage(error));
			} else {
				var bCompact = !!this.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.alert(
					"Bitte füllen Sie alle Pflichtfelder aus", {
						styleClass: bCompact ? "sapUiSizeCompact" : ""
					}
				);
			}

		},

		reloadPage: function () {
			this.getRouter().navTo("master", {
				activityId: "sideNav"
			});

			this.getModel("hiddenModel").setProperty("/noProject", true);
			this.getModel("hiddenModel").setProperty("/page", false);
		},

		checkDataFields: function (oEntry) {
			const values = Object.values(oEntry);
			var dataOk = true;
			values.forEach(function (value) {
				if (value === undefined || value === null) {
					dataOk = false;
				}
			});
			return dataOk
		},

		onCreateEntry: function (timeRecord) {
			var selectedDate = this.date;
			var dateFormat = sap.ui.core.format.DateFormat.getDateInstance({
				pattern: "YYYY-MM-ddTHH:mm:ss"
			});
			var formattedDate = dateFormat.format(selectedDate);
			var oModel = this.getView().getModel();
			var timeRecordId = timeRecord.id
			var oEntry = {};
			var self = this;
			oEntry.EmployeeId = this.persNr.toString();
			oEntry.Datum = formattedDate;
			oEntry.Duration = this.duration;
			oEntry.ActivityTitle = this.activityName;
			oEntry.ProjectTitle = this.projectDescription;
			//oEntry.ActivityType = this.activityType;
			oEntry.Description = this.desc;
			oEntry.ParentKey = this.parrentKey;
			oEntry.OrderType = "1000";
			oEntry.ExternalId = timeRecordId;
			var test = false;
			if (this.checkDataFields(oEntry)) {
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
						oModel.refresh(true, true);
					},
					error: function (oError) {
						// Error 
						self.deleteTimeRecordFromOnePoint(timeRecord, timeRecord.id, true, oError);
						console.error(oError);
						MessageToast.show("Zeit konnte nicht im SAP gespeichert werden");
					}
				});
				this.durationSelected = false;
				this.activityTypeSelected = false;
				this.descSelected = false;
				this.clearInputs();
				this.getTimeEntriesForCurrentMonth();
				this.oEventBus.publish("calculateTotalActivityTimeforDay");
			} else {
				self.deleteTimeRecordFromOnePoint(timeRecord, timeRecord.id, true);
				MessageToast.show("Zeit konnte nicht im SAP gespeichert werden");
			}

		},

		// calculate expectedEffort and set model
		calculateExpectedEffort: function (baseEffort, effortVariances) {
			var expectedEffort = baseEffort + effortVariances;
			var oModel = new JSONModel({
				effort: expectedEffort
			});
			this.setModel(oModel, "expectedEffort");
		},

		// restore the deleted entry if something going wrong
		restoreEntry: function (timeObject) {
			var oModel = this.getView().getModel();
			var oEntry = {};
			var self = this;
			oEntry.EmployeeId = timeObject.EmployeeId;
			oEntry.Datum = timeObject.Datum;
			oEntry.Duration = timeObject.Duration;
			oEntry.ActivityTitle = timeObject.ActivityTitle;
			oEntry.ProjectTitle = timeObject.ProjectTitle;
			oEntry.ActivityType = timeObject.ActivityType
			oEntry.Description = timeObject.Description;
			oEntry.ParentKey = timeObject.ParentKey;
			oEntry.OnePointId = timeObject.OnePointId;

			oModel.setHeaders({
				"content-type": "application/json",
				"method": "POST",
				"charset": "utf-8",
				"X-CSRF-Token": "Sy20dYnUW2c22JGDMqhZHg=="
			});
			oModel.create('/OrderItemSet', oEntry, {
				success: function (oData, oResponse) {
					// Success 
					MessageToast.show("Zeit wurde wiederhergestellt");
					oModel.refresh(true, true);
					self.getProjectPlan(self.projectId);
				},
				error: function (oError) {
					// Error 
					MessageToast.show("Zeit konnte nicht wiederhergestellt werden - Bitte kontaktieren Sie ihren Admin");
				}
			});
		},

		initProjectinDb: function (currentProjectId, currentProjectTitle) {
			var oModel = this.getView().getModel();
			var oEntry = {};
			var self = this;
			oEntry.OrderTyp = "1000";
			oEntry.ExternalId = currentProjectId;
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
					self.projectDescription = oData.Description;
				},
				error: function (oError) {
					console.log(oError)
				}
			});
		},

		getIsProjectInDb: function (project) {
			var projectArray = project.results;
			var currentProjectId = this.getModel("project").getProperty("/activity/projectPlan/project/id");
			var currentProjectTitle = this.getModel("project").getProperty("/activity/projectPlan/project/displayName");
			for (var i = 0; i < projectArray.length; i++) {
				if (projectArray[i].ExternalId === currentProjectId) {
					this.projectIsInDb = true;
					this.parrentKey = projectArray[i].DbKey;
					this.projectDescription = projectArray[i].Description;
					break;
				}
			}
			if (this.projectIsInDb === false) {
				this.initProjectinDb(currentProjectId, currentProjectTitle);
				this.projectIsInDb = false;
			}

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

		clearInputs: function () {
			this.byId("inputTime").setValue("");
			this.byId("area0").setValue("");
			this.byId("input_effort").setValue("");
			this.byId("complete_checkbox").setSelected(false);
		}

	});
});