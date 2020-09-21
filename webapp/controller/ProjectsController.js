sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/MessageBox",
	'sap/m/MessageToast',
	'Zeiterfassung/service/onepoint/queries',
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	'sap/ui/model/json/JSONModel',
	'Zeiterfassung/model/formatter'
], function (Controller, UIComponent, MessageBox, MessageToast, queries, Filter, FilterOperator, JSONModel, formatter) {
	"use strict";

	return {

		loadProjects: function () {

			return new Promise((resolve, reject) => {
				this.userId = sap.ui.getCore().getModel("user").getProperty("/id");
				this.token = queries.getToken();

				/*******get onepoint projects for current user********/
				var query = queries.getProjects(this.userId);

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

						await this._getActivities(filtered).then(() => {
							resolve();
						}).catch(error => {
							reject(console.log(error));
						});
					}
				}

				request();
			});

		},

		_getActivities: function (filteredProjects) {
			return new Promise((resolve, reject) => {
				this.token = queries.getToken();
				var projectWithActivity = [];
				filteredProjects.forEach((project, indexProjects)  => {
					var activities = [];
					project.activities.forEach((activity, index) => {
						var i = index;
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
								if ((i + 1) === project.activities.length) {
									if (!projectWithActivity.includes(project)) {
										projectWithActivity.push(project);
									}
								}
							}

							// if last project and last activity from project, resolve promise
							if ((indexProjects + 1) === (filteredProjects.length)) {
								if ((i + 1) === (project.activities.length)) {
									// set model
									let oModel = new JSONModel(projectWithActivity);
									sap.ui.getCore().setModel(oModel, "projectsModel");
									this.createProjectCountModel(projectWithActivity);
									resolve();
								}
							};
						}

						request();

					});

				});
			})

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

			sap.ui.getCore().setModel(oModel, "projectsCount");
		},
	}

});