sap.ui.define([
	'Zeiterfassung/controller/BaseController',
	'sap/m/MessageToast',
	'sap/ui/model/json/JSONModel',
	'Zeiterfassung/model/formatter',
	'Zeiterfassung/service/onepoint/queries',
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	'Zeiterfassung/controller/ProjectsController',
], function (BaseController, MessageToast, JSONModel, formatter, queries, Filter, FilterOperator, ProjectsController) {
	"use strict";

	return BaseController.extend("Zeiterfassung.controller.projects.Master", {
		formatter: formatter,

		onInit: async function () {

			var oModel = new JSONModel({
				busy: true
			});

			this.setModel(oModel, "busy");

			this.userId = sap.ui.getCore().getModel("user").getProperty("/id");
			this.isFavoriteNavigation = false;

			var expandetModel = new JSONModel({
				expandet: false
			});
			this.setModel(expandetModel, "expandetModel")

			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.getRoute("master").attachPatternMatched(this._onObjectMatched, this);
			this.getProjects();

		},

		getProjects: function () {
			/*******get onepoint projects for current user********/
			var query = queries.getProjects(this.userId);
			this.token = queries.getToken();

			/*******make a async request to the api and wait for the response before set the model********/
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
				}).catch((error) => {
					reject(console.error('Error:', error));
				});

				const json = await response.json();
				let rawData = json.data.resource.assignments;
				let projects = [];
				let activities = [];
				// this was used in detail view to show no data text
				if (rawData.length > 0) {

					// push the project object to the array
					rawData.forEach(function (raw) {
						// get not finished projects / Projektabschluss = 406945941
						if (raw.projectPlan.project.projectStatus.id !== "406945941") {
							let projectFound = false;
							if (projects.length > 0) {
								for (let i = 0; i < projects.length; i++) {
									if (projects[i].id === raw.projectPlan.project.id) {
										projectFound = true;
										if (!projects[i].activities.includes(raw.activity.id)) {
											projects[i].activities.push(raw.activity.id);
										}
										break;
									}
								}

								if (!projectFound) {
									activities.push(raw.activity.id);
									var project = {
										id: raw.projectPlan.project.id,
										name: raw.projectPlan.project.name,
										activities: activities,
										projectPlan: raw.projectPlan
									}
									projects.push(project);
									activities = [];
								}

							} else {
								activities.push(raw.activity.id);
								var project = {
									id: raw.projectPlan.project.id,
									name: raw.projectPlan.project.name,
									activities: activities,
									projectPlan: raw.projectPlan
								}
								projects.push(project);
								activities = [];
							}

						}
					});

					// filter duplicated entries
					const filtered = projects.filter(function ({
						name,
						id
					}) {
						const key = `${name}${id}`;
						return !this.has(key) && this.add(key);
					}, new Set);

					this._getActivities(filtered)
				}
			}

			request();
		},

		_onObjectMatched: function (oEvent) {
			this.setFavoriteActivities();
			var activityId = oEvent.getParameter("arguments").activityId;
			if (activityId !== "sideNav") {
				this.isFavoriteNavigation = true;
				this._navToDetail(activityId);
				let selectedModel = new JSONModel({
					id: activityId
				})
				this.setModel(selectedModel, "selected");
			}

			// use event bus to call checkClockstate from timer controller
			var oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.getView()).getEventBus();
			oEventBus.publish(
				"checkClockState"
			);

			oEventBus.publish(
				"startPresenceClock"
			);

			// update calendar
			oEventBus.publish(
				"setCalendarDate"
			);
		},

		_getActivities: function (filteredProjects) {
			var self = this;
			var projectWithActivity = [];
			filteredProjects.forEach((project, indexProjects) => {
				var activities = [];
				for (var i = 0; i < project.activities.length; i++) {
					var activity = project.activities[i];

					const request = async() => {
						const response = await fetch(`https://europe.onepoint-projects.com/api/json/v2/tasks/getTaskById/${activity}`, {
							method: 'GET',
							headers: {
								"Authorization": `Bearer ${this.token}`,
								"Content-Type": "application/json",
							},
						}).catch(function (error) {
							reject(console.log(error));
						});

						const activityJson = await response.json();

						//  Status 1, noch keine Rückmeldung erfolgt, Status 2 in Arbeit, Status 3 abgeschlossen
						if (activityJson.status !== 3) {
							activities.push(activityJson);
						}

						// if project has activities, push it to the new Array
						if (activities.length > 0) {
							project.activitiesNew = activities;
							if (i === project.activities.length) {
								if (!projectWithActivity.includes(project)) {
									projectWithActivity.push(project);
								}
							}
						}

						var oModel = new JSONModel(projectWithActivity);
						this.setModel(oModel, "projects");

						// if last project and last activity from project, resolve promise
						if ((indexProjects + 1) === (filteredProjects.length)) {
							if (i === project.activities.length) {
								// set model
								this.projectModel = oModel;
								this.createProjectCountModel(projectWithActivity);
								setTimeout(function () {
									self.onFilterPipelinePhase(null, true);
								}, 100)
								this.getModel("busy").setProperty("/busy", false);
							}
						};
					}

					request();

				};

			});
		},

		createProjectCountModel: function (pojectsArray) {
			/*
				projectPlanung ID  = 455278692
				projekumsetzung ID = 406945942
			*/

			let projectPlanung = [];
			let projekumsetzung = [];
			let others = [];

			pojectsArray.forEach(function (item) {
				// get projects with status Projektplanung
				if (item.projectPlan.project.projectStatus.id === "455278692") {
					projectPlanung.push(item);
				}
				// get projects with status projektumsetzung
				else if (item.projectPlan.project.projectStatus.id === "406945942") {
					projekumsetzung.push(item);
				} else {
					others.push(item);
				}
			});

			var projectsCountAll = projectPlanung.length + projekumsetzung.length;

			var oModel = new JSONModel({
				projectsCountAll,
				projectPlanung: projectPlanung.length,
				projekumsetzung: projekumsetzung.length,
				others: others.length
			})

			this.setModel(oModel, "projectsCount");
		},

		onMasterPressed: function (oEvent) {
			var oItem = oEvent.getSource();
			// get selected activity object and set it as core mode to use it on other controllers
			var oData = oItem.getBindingContext("projects").getObject();
			var activityID = oData.id;
			this._navToDetail(activityID);
		},

		setFavoriteActivities: function () {
			this.getFavoriteActivities()
				.then(result => {
					var oModel = new JSONModel(result);
					this.setModel(oModel, "favoritesModel");
				}).catch(error => {
					console.log(error);
				});
		},

		onFilterFavorites: function () {
			var navItems = [];
			var item = null;
			var self = this;

			var favorites = this.getModel("favoritesModel").oData;
			var oList = this.getView().byId("navigationList");
			var oBinding = oList.getBinding("items");
			oList.destroyItems();

			favorites.forEach(function (favorite, index) {
				item = new sap.tnt.NavigationListItem({
					text: favorite.activity.name,
					icon: 'sap-icon://favorite'
				});

				item.attachSelect(self.onFavPressed, self);
				item.setBindingContext(new sap.ui.model.Context(self.getModel("favoritesModel").oData[index]),
					"favActivity");
				navItems.push(item)
			});

			navItems.forEach(function (navItem) {
				oList.addItem(navItem);
			});
		},

		onFavPressed: function (oEvent) {
			var oItem = oEvent.getSource();
			var oData = oItem.getBindingContext("favActivity").oModel;
			var activityID = oData.activity.id;
			this._navToDetail(activityID);
		},

		onFilterPipelinePhase: function (oEvent, isInitial) {
			var searchField = this.byId("field0");
			searchField.clear();
			var oList = this.getView().byId("navigationList");

			// remove favorites from list
			var allItems = oList.getItems();
			allItems.forEach(function (item, index) {
				var favItem = item.getBindingContext("favActivity");
				if (favItem !== undefined) {
					oList.removeItem(item);
				}
			})

			var oBinding = oList.getBinding("items");
			var sId;
			var aFilter = [];

			// initial is on page load
			if (isInitial) {
				sId = "all";
			} else {
				sId = oEvent.getSource().getSelectedKey();
			}

			var allProjects = new Filter({
				filters: [
					new Filter("projectPlan/project/projectStatus/id", FilterOperator.EQ, "455278692"),
					new Filter("projectPlan/project/projectStatus/id", FilterOperator.EQ, "406945942")
				],
				or: true,
			});

			var otherProjects = new Filter({
				filters: [
					new Filter("projectPlan/project/projectStatus/id", FilterOperator.NE, "455278692"),
					new Filter("projectPlan/project/projectStatus/id", FilterOperator.NE, "406945942")
				],
				and: true,
			});

			if (sId === "others") {
				oBinding.filter(otherProjects, sap.ui.model.FilterType.Application);
			} else if (sId === "all") {
				oBinding.filter(allProjects, sap.ui.model.FilterType.Application);
			} else {
				aFilter.push(new Filter("projectPlan/project/projectStatus/id", FilterOperator.EQ, sId));
				oBinding.filter(aFilter, sap.ui.model.FilterType.Application);
			}

		},

		onFilterActivities: function (oEvent) {
			var sQuery = oEvent.getSource().getValue().toLowerCase();
			var projectModel = JSON.parse(JSON.stringify(this.projectModel.oData));
			if (sQuery.length > 0) {
				var filteredProjects = [];
				var oModel = projectModel;
				var activityFilter = [];
				oModel.forEach(function (project) {
					if (project.name.toLowerCase().includes(sQuery) || stringIsInActivity(project)) {
						filteredProjects.push(project);
					}
				});

				function stringIsInActivity(project) {
					var filteredActivity = [];
					for (var i = 0; i < project.activitiesNew.length; i++) {
						if (project.activitiesNew[i].name.toLowerCase().includes(sQuery)) {
							filteredActivity.push(project.activitiesNew[i]);
							project.activitiesNew = filteredActivity;
							return true
							break;
						}
					}
					return false
				}

				var filteredModel = new JSONModel(filteredProjects);
				this.setModel(filteredModel, "projects");

				//this.getModel("expandetModel").setProperty("/expandet", true);

			} else {
				this.setModel(this.projectModel, "projects");
				this.onFilterPipelinePhase(null, true);
				//this.getModel("expandetModel").setProperty("/expandet", false);
			}

		},

		/*		onFilterActivities: function (oEvent) {
					// set key of filter to all projects
					var projectStateFilter = this.byId("header0");
					projectStateFilter.setSelectedKey("all");

					// build filter array
					var aFilter = [];
					var sQuery = oEvent.getSource().getValue();
					if (sQuery) {
						aFilter.push(new Filter("name", FilterOperator.Contains, sQuery));
					}

					// filter binding
					var oList = this.getView().byId("navigationList");
					var oBinding = oList.getBinding("items");
					oBinding1.filter(aFilter);
				},*/

		_navToDetail: function (activityID) {
			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.navTo("detail", {
				activityId: activityID
			});
		},

		onSavePressed: function () {
			MessageToast.show("Save was pressed");
		},

		onCancelPressed: function () {
			MessageToast.show("Cancel was pressed");
		},
		onNavButtonPress: function () {
			this.getOwnerComponent().myNavBack();
		},

		_getAssignments: function (filteredProjects) {
			var projectWithActivity = [];
			filteredProjects.forEach((item, index) => {
				const request = async() => {
					const response = await fetch(`https://europe.onepoint-projects.com/api/json/v2/tasks/listTasksOfProject/${item.id}`, {
						method: 'GET',
						headers: {
							"Authorization": `Bearer ${this.token}`,
							"Content-Type": "application/json",
						},
					}).catch(function (error) {
						console.log(error);
					});

					const json = await response.json();
					let rawData = json.activity;
					let activites = [];

					// push the project object to the array
					var self = this;
					rawData.forEach(function (item) {
						//  Status 1, noch keine Rückmeldung erfolgt, Status 2 in Arbeit, Status 3 abgeschlossen
						if (item.responsibleResource === self.userId && item.status !== 3) {
							activites.push(item);
						}
					});

					// if project has activities, push it to the new Array
					if (activites.length > 0) {
						item.activities = activites;
						projectWithActivity.push(item);
						if (!this.isFavoriteNavigation) {
							this._navToDetail(item.activities[0].id);
							let selectedModel = new JSONModel({
								id: item.activities[0].id
							})
							this.setModel(selectedModel, "selected");
						}
					}

					// set model
					let oModel = new JSONModel(projectWithActivity);
					this.setModel(oModel, "projects");
				}

				request();
			})

		}

	});
});