sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"Zeiterfassung/model/models",
	'Zeiterfassung/service/onepoint/queries',
	'sap/ui/model/json/JSONModel',
	'Zeiterfassung/controller/ProjectsController',
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/Text",
	"sap/m/FlexBox",
	"sap/ui/core/Icon"
], function (UIComponent, Device, models, queries, JSONModel, ProjectsController, Dialog, Button, Text, FlexBox, Icon) {
	"use strict";

	return UIComponent.extend("Zeiterfassung.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function () {

			// set the page for home:0, project:1, others:3
			var pageModel = new JSONModel({
				pageId: 0,
				context: null
			});
			sap.ui.getCore().setModel(pageModel, "pageModel");

			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// get userInfo and set the router
			//this.getUserInfo();

			// use it only for development
			var oUserData = new JSONModel({
				userName: "Olcay Elikci",
				id: "558891690",
				persNr: 80042,
				persNrWithZeros: "00080042"
			});
			sap.ui.getCore().setModel(oUserData, "user");
			this.getPersNrWithZeros(oUserData.oData.persNr)

			// set the device model
			this.setModel(models.createDeviceModel(), "device");

		},

		/* 
			Workflow: get userInfo 
			
			1. get user name from:  /sap/bc/ui2/start_up -> Login info from SAP (FIORI)
			2. get resourceId from onepoint v3 api -> https://europe.onepoint-projects.com/api/v3
			3. get persNr from onepoint v2 api -> this.getPersNrFromV2Api(resourceId);
			4. get the persNr with zeros from sap service. it's the value for filtering the time entries -> getPersNrWithZeros(persNr)
			5. set the router and show the app.
	    */

		getUserInfo: function () {
			//Get User details by using srv;
			var y = "/sap/bc/ui2/start_up";
			var xmlHttp = null;
			xmlHttp = new XMLHttpRequest();
			var self = this;
			xmlHttp.onreadystatechange = function () {
				if (xmlHttp.readyState === 4 && xmlHttp.status === 200) {
					var oUserData = JSON.parse(xmlHttp.responseText);
					var query = queries.getResourceByName(oUserData.fullName);
					var token = queries.getToken()
					const request = async() => {
						const response = await fetch('https://europe.onepoint-projects.com/api/v3', {
							method: 'POST',
							headers: {
								"Authorization": `Bearer ${token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								query,
							})
						}).catch((error) => {
							console.error('Error:', error);
						});

						const json = await response.json();

						self.getPersNrFromV2Api(json.data.resourceNodes[0].id);

						// set global user model
						let oModel = new JSONModel({
							userName: json.data.resourceNodes[0].fullName,
							id: json.data.resourceNodes[0].id,
							persNr: "",
							persNrWithZeros: ""
						});

						sap.ui.getCore().setModel(oModel, "user");

						// set view model
						var oUserData = new JSONModel({
							userName: sap.ui.getCore().getModel("user").getProperty("/userName")
						});

						self.setModel(oUserData, "user");
					}
					request();
				}
			};

			xmlHttp.open("GET", y, false);
			xmlHttp.send(null);

		},

		/*
			@param {string} userId - comes from onepoint resource 
			enable routing after setting the user model
		*/
		getPersNrWithZeros: function (userId) {
			var convertedUserId = userId.toString().padStart(5, '0');
			if (userId === 131) {
				convertedUserId = "EDV_GUGDU";
			}
			var oModel = this.getModel("userModel");
			var self = this;
			let perNr;
			oModel.read(`/UserSet('${convertedUserId}')`, {
				success: function (oResponse, oData) {
					perNr = oResponse.EmployeeId;
					sap.ui.getCore().getModel("user").setProperty("/persNrWithZeros", perNr);
					// enable routing after setting the user model
					var oRouter = self.getRouter();
					if (oRouter) {
						oRouter.initialize();
					}
				},
				error: function (oError) {
					console.log(oError)
				}
			});
		},

		/* a persnr must contain 5 digits. 
			@param{string} userId 
			@return{string} userId
		*/

		myNavBack: function () {
			var oHistory = History.getInstance();
			var oPrevHash = oHistory.getPreviousHash();
			if (oPrevHash !== undefined) {
				window.history.go(-1);
			} else {
				this.getRouter().navTo("master", {}, true);
			}
		},

		getContentDensityClass: function () {
			if (!this._sContentDensityClass) {
				if (!sap.ui.Device.support.touch) {
					this._sContentDensityClass = "sapUiSizeCompact";
				} else {
					this._sContentDensityClass = "sapUiSizeCozy";
				}
			}
			return this._sContentDensityClass;
		},

		/* 
			@param{string} resourceId
			@return{string} persNr
		
		*/
		getPersNrFromV2Api: function (resourceId) {
			var token = queries.getToken()
			var self = this;
			const request = async() => {
				const response = await fetch(
					`https://europe.onepoint-projects.com/api/json/v2/resources/getResourceById/${resourceId}`, {
						method: 'GET',
						headers: {
							"Authorization": `Bearer ${token}`,
							"Content-Type": "application/json",
						}
					});

				const json = await response.json();
				var persNr = json.customValues[0].value;
				sap.ui.getCore().getModel("user").setProperty("/persNr", persNr);
				self.getPersNrWithZeros(persNr);
			}
			request();
		}

	});

});