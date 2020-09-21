sap.ui.define([
	'Zeiterfassung/controller/BaseController',
	'sap/m/MessageToast',
	'sap/ui/model/json/JSONModel',
	'Zeiterfassung/model/formatter',
	'Zeiterfassung/service/onepoint/queries',
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, MessageToast, JSONModel, formatter, queries, Filter, FilterOperator) {
	"use strict";
	return BaseController.extend("Zeiterfassung.controller.others.MasterOther", {
		formatter: formatter,

		onInit: function () {
			this.isFavoriteNavigation = false;
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.getRoute("others").attachPatternMatched(this._onObjectMatched, this);
		},

		onAfterRendering: function () {
			this.getCustOrdTypeSubSet();
		},

		_onObjectMatched: function (oEvent) {
			var type = oEvent.getParameter("arguments").type;
			var typeSub = oEvent.getParameter("arguments").typeSub;
			if (type !== "sideNav") {
				var oData = sap.ui.getCore().getModel("selectedProject").getData();
				var oModel = new JSONModel({
					Description: oData.Description
				});
				this.setModel(oModel, "selected");
				this.isFavoriteNavigation = true;
				this._navToDetail(type, typeSub);
			}

			this.setFavoriteOtherActivites();

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

		/*initNavItem: function () {
			setTimeout(() => {
				if (!this.isFavoriteNavigation) {
					var nav = this.byId("navigationList1");
					this.onMasterPressed(null, true, nav.getSelectedItem());
				}
			}, 2000);
		},*/

		onMasterPressed: function (oEvent, init, selectedItem) {
			var oItem = "";
			if (init === undefined) {
				oItem = oEvent.getSource();
			} else if (init === true) {
				oItem = selectedItem;
			}
			if (oItem !== undefined && oItem !== null) {
				var oModel = new JSONModel(oItem.getBindingContext().getObject());

				sap.ui.getCore().setModel(oModel, "selectedProject");
				var type = oItem.getBindingContext().getObject().Type;
				var typeSub = oItem.getBindingContext().getObject().TypeSub;
				var description = oItem.getBindingContext().getObject().Description;

				this._navToDetail(type, typeSub);
			}
		},

		setFavoriteOtherActivites: function () {
			var oModel = this.getFavoriteOtherActivites();
			this.setModel(oModel, "otherFavoritesModel");
		},

		onFilterFavorites: function () {
			var navItems = [];
			var item = null;
			var self = this;

			var favorites = this.getModel("otherFavoritesModel").oData;
			var oList = this.getView().byId("navigationList1");
			var oBinding = oList.getBinding("items");

			var allItems = oList.getItems();
			/*
				Remove favorites to show the full list. This method works like a switch to show full list and favorites on each click.
				If favorites available or fav list is empty, show the full list
			*/
			if (allItems.length > 0 && allItems[0].getBindingContext("favActivity") !== undefined || allItems.length === 0) {
				this.byId("navigationList1").getBinding("items").refresh();
			} else {
				oList.destroyItems();

				favorites.forEach(function (favorite, index) {
					item = new sap.tnt.NavigationListItem({
						text: favorite.Description,
						icon: 'sap-icon://favorite'
					});

					item.attachSelect(self.onFavPressed, self);
					item.setBindingContext(new sap.ui.model.Context(self.getModel("otherFavoritesModel").oData[index]),
						"favActivity");
					navItems.push(item)
				});

				navItems.forEach(function (navItem) {
					oList.addItem(navItem);
				});
			}
		},

		onFavPressed: function (oEvent) {
			var oItem = oEvent.getSource();
			var oData = oItem.getBindingContext("favActivity").oModel;
			var oModel = new JSONModel(oData);
			sap.ui.getCore().setModel(oModel, "selectedProject");
			var type = oData.Type;
			var typeSub = oData.TypeSub;
			this._navToDetail(type, typeSub);
		},

		getCustOrdTypeSubSet: function () {
			var oModel = this.getView().getModel();
			var subTypes;
			var self = this;
			oModel.read("/CustOrdTypeSubSet", {
				success: function (oResponse, oData) {
					for (var i = 0; i < oResponse.results.length; i++) {
						if (oResponse.results[i].Type !== "1000" && oResponse.results[i].Type !== "2000") {
							subTypes = oResponse.results[i];
							var subTypeModel = new JSONModel({
								types: subTypes
							});
							self.setModel(subTypeModel, "subTypeModel");
							break;
						}
					}
					// if favorite from home is clicked, the model will be set in _onObjectMatched
					if (!self.isFavoriteNavigation) {
						let selectedModel = new JSONModel({
							Description: subTypes.Description
						})
						self.setModel(selectedModel, "selected");
					}

				},
				error: function (oError) {
					console.error(oError);
				}
			});
		},

		_navToDetail: function (type, typeSub) {
			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.navTo("detailOthers", {
				type: type,
				typesub: typeSub
			});
		},

		onFilterActivities: function (oEvent) {
			// build filter array
			var aFilter = [];

			var sQuery = oEvent.getSource().getValue();
			if (sQuery) {
				aFilter.push(
					new Filter({
						path: "Description",
						operator: FilterOperator.Contains,
						value1: sQuery,
						caseSensitive: false
					})
				);
			}

			// filter binding
			var oList = this.getView().byId("navigationList1");
			var oBinding = oList.getBinding("items");
			oBinding.filter(aFilter);
		},

		onSavePressed: function () {
			MessageToast.show("Save was pressed");
		},

		onCancelPressed: function () {
			MessageToast.show("Cancel was pressed");
		},
		onNavButtonPress: function () {
			this.getOwnerComponent().myNavBack();
		}

	});
});