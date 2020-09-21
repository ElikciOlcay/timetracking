sap.ui.define([
	'Zeiterfassung/controller/BaseController',
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/MessageBox",
	'sap/m/MessageToast',
	'Zeiterfassung/service/onepoint/queries',
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	'sap/ui/model/json/JSONModel',
	'Zeiterfassung/model/formatter',
], function (BaseController, Controller, UIComponent, MessageBox, MessageToast, queries, Filter, FilterOperator, JSONModel, formatter) {
	"use strict";

	var zammadApiUrl = 'https://ksszammad.kh-schwarzach.local/api/v1';
	var zammadDburl = 'https://ksszammad.kh-schwarzach.local/addons/zammad-time-infos.php?';

	return {

		getOrderItemSet: function (oModel, view, date, perNr) {
			var self = this;
			this.view = view;
			this.date = date;
			var timeStamp = this._convertDateToTimestamp(date);
			var filters;
			filters = new Filter({
				filters: [
					new Filter("EmployeeId", FilterOperator.EQ, perNr),
					new Filter("Datum", FilterOperator.EQ, timeStamp)
				],
				and: true,
			});
			oModel.read("/OrderItemSet", {
				filters: filters.aFilters,
				success: function (response, oData) {
					//response will have the return of the request
					self.timeTrackingActivities = response.results;
					self.getZammadTimeAcountings();
				},
				error: function (e) {
					console.log(e);
				}
			});
		},

		getZammadTimeAcountings: async function () {
			var oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.view).getEventBus();
			var self = this;
			var zammadUserId = await this.getZammadUserId();
			var date = this.date;
			var year = date.getFullYear();
			var month = date.getMonth() + 1;
			var day = date.getDate();
			var dateStringFrom = 'created_at.gte.' + year + '-' + month + '-' + day + 'T00:00:00.000,';
			var dateStringTo = 'created_at.lte.' + year + '-' + month + '-' + day + 'T23:59:00.000';
			var dateQuerie = '(' + dateStringFrom + dateStringTo + ')';
			/*******get zammad times********/
			const request = async() => {
				const response = await fetch(
					`${zammadDburl}userid=26&start=2018-02-21&end=2018-02-21`, {
						method: 'GET',
						headers: {
							"Content-Type": "application/json",
						},
					}).catch((error) => {
					reject(console.error('Error:', error));
				});

				const json = await response.json();

				/*
					If the day has zammad time entries, merge the entries with the other time entries, otherwiese 
					set the model only with the other time entries.
				*/
				if (json.length > 0) {
					var zammadActivities = [];
					for (var i = 0; i < json.length; i++) {
						var item = json[i];
						var isInDb = false;
						// check if zammad entry is allready in sap db 
						for (var b = 0; b < self.timeTrackingActivities.length; b++) {
							var sapItem = self.timeTrackingActivities[b];
							if (sapItem.ExternalId === item.id.toString()) {
								isInDb = true;
								break;
							}
						}
						if (!isInDb) {

							oEventBus.publish("setZammadButtonMode", {
								visible: true
							});

							var ticketInfo = await self.getZammadTicketInfo(item.ticket_id);
							var ticketArticleInfo = await self.getZammadTicketArticleInfo(item.ticket_article_id);
							var ticketTitle = ticketInfo.title;
							var ticketArticleBody = ticketArticleInfo.body;
							zammadActivities.push({
								Duration: item.time_unit / 60,
								ProjectTitle: ticketTitle,
								ActivityTitle: ticketArticleBody,
								Description: ticketArticleBody,
								id: item.id,
								ticket_id: item.ticket_id,
								isNew: true,
								OrderType: "2000"
							});
						}

						if (i === json.length - 1) {
							var activities = zammadActivities.concat(self.timeTrackingActivities);
							var oModel = new JSONModel(activities);
							self.setModelForHome(oModel);
						}
					};
				} else {
					var oModel = new JSONModel(self.timeTrackingActivities);
					oEventBus.publish("setZammadButtonMode", {
						visible: false
					});
					self.setModelForHome(oModel);
				}
			}
			request();
		},

		setModelForHome: function (model) {
			var oEventBus = sap.ui.core.Component.getOwnerComponentFor(this.view).getEventBus();
			oEventBus.publish(
				"setModelFromZammadService", {
					model
				}
			);
		},

		getZammadTicketInfo: function (ticketId) {
			return new Promise((resolve, reject) => {
				var self = this;
				/*******get zammad times********/
				const request = async() => {
					const response = await fetch(
						`${zammadApiUrl}/tickets/${ticketId}`, {
							method: 'GET',
							headers: {
								"Content-Type": "application/json",
								"Authorization": "Basic ODAwNDI6R3Jvc3NhcmwxOTg3IQ=="
							},
						}).catch((error) => {
						reject(console.error('Error:', error));
					});
					const json = await response.json();
					resolve(json);
				}
				request();
			});
		},

		getZammadTicketArticleInfo: function (ticket_article_id) {
			return new Promise((resolve, reject) => {
				var self = this;
				/*******get zammad times********/
				const request = async() => {
					const response = await fetch(
						`${zammadApiUrl}/ticket_articles/${ticket_article_id}`, {
							method: 'GET',
							headers: {
								"Content-Type": "application/json",
								"Authorization": "Basic ODAwNDI6R3Jvc3NhcmwxOTg3IQ=="
							},
						}).catch((error) => {
						reject(console.error('Error:', error));
					});

					const json = await response.json();
					resolve(json);
				}
				request();
			});
		},

		getZammadUserId: function () {
			var perNr = sap.ui.getCore().getModel("user").getProperty("/persNr");
			var self = this;
			return new Promise((resolve, reject) => {
				/*******get zammad times********/
				const request = async() => {
					const response = await fetch(
						`${zammadApiUrl}/users`, {
							method: 'GET',
							headers: {
								"Content-Type": "application/json",
								"Authorization": "Basic ODAwNDI6R3Jvc3NhcmwxOTg3IQ=="
							},
						}).catch((error) => {
						reject(console.error('Error:', error));
					});

					const json = await response.json();
					resolve(json[0].id);
				}
				request();
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

	}

});