sap.ui.define([
		"sap/ui/model/json/JSONModel",
		"sap/ui/core/mvc/Controller"
	],
	function (JSONModel, Controller) {
		"use strict";
		return {

			getToken: function () {
				var token =
					"ZkTPMSTPWZwgNvK6YaA8s0WC9e9KbLNxjYN3ZDFzG9EZrJ8XiEZzZLUIVujgJreTz4jGimNdLJKvqynH2c9zbZjPLzs5QomEmvZxNLQnH5yjX6H0vqUpU5U4xwDTDIJC";
				return token;
			},

			getProjects: function (id) {
				var query =
					`query getMemberProjects {
					  resource(id: ${id}) {
					    name
					    displayName
					    id
					    assignments {
					      id
					      activity {
					        name
					        id
					      }
					      projectPlan {
					        project {
					          projectStatus {
					            id
					          }
					          
					          name
					          id
					        }
					      }
					    }
					  }
				}`;

				return query;
			},

			getResourceByName: function (name) {
				var query =
					`query getResourceByName {
					  resourceNodes(filter: { fullName: {op: Eq, value: "${name}"}}  ) {
					    id,name, fullName, displayName
					  }
					}`;
				return query;
			},

			getOnePointActivity: function (id) {
				var query =
					`query getOnePointActivity {
					  resource(id: ${id}) {
					    name
					    displayName
					    id
					    assignments {
					      id
					      baseEffort {
					        inHours
					      }
					      activity {
					        id
					        name
					        baseEffort {
					          inHours
					        }
					        aggregatedAssignedResources{fullName, id}
					        projectPlan {
					          project {
					            id
					            displayName
					            description {
					              plain
					            }
					            plan {
					              baselineVersion {
					                baseEffort {
					                  inHours
					                }
					              }
					            }
					          }
					        }
					      }
					    }
					  }
					}

					`;

				return query;
			},

			getActivityWorkRecord: function (acitvityId, ressourceId) {
				var query = 
				`query getWorkRecordForActivity{
				  workRecords(
				    filter: {
				      activity: { id: { op: Eq, value: ${acitvityId} } }
				      resource: { id: { op: Eq, value: ${ressourceId} } }
				    }
				  ) {
				    resource {
				      id
				      name
				    }
				    actualEffort
				    date
				  }
				}`;
				
				
				return query
				
			},

		};

	});