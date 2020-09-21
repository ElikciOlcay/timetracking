sap.ui.define([], function () {
	"use strict";
	return {
		/**
		 * Formats a given string to uppercase.
		 *
		 * @function
		 * @param {string} sName string to be formatted
		 * @public
		 */
		toUpperCase: function (sName) {
			return sName && sName.toUpperCase();
		},

		dateConverter: function (s) {
			var dateString;
			var options = {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			};
			if (s !== undefined) {
				var date = new Date(s);
				dateString = date.toLocaleDateString('de-DE', options);
			} else {
				dateString = "kein Datum vorhanden";
			}
			return dateString;
		},

		effortText: function (s) {
			if (s !== undefined) {
				var t = s.toFixed(2);
				var time = t.toString().split('.');
				var minutes = time[1];
				var stringMinutes = '0.' + minutes;
				var floatMinutes = parseFloat(stringMinutes);
				var realMinutes = Math.round(floatMinutes * 60);
				var realHours = time[0];
				var stundenString;

				if (realHours === "1") {
					stundenString = " Stunde";
				} else {
					stundenString = " Stunden";
				}
				return realHours + stundenString + " " + realMinutes + " Minuten";
			} else {
				return "";
			}

		},

		time: function (s) {
			if (s !== undefined) {
				var sc = s.ms;
				var ms = sc % 1000;
				s = (sc - ms) / 1000;
				var secs = s % 60;
				s = (s - secs) / 60;
				var mins = s % 60;
				if (mins === 0) {
					mins = "00";
				}
				var hrs = (s - mins) / 60;
				return hrs + ':' + mins;
			}
			return null;
		},

		decimalTimeToTime: function (t) {
			if (t !== null && t !== undefined) {
				var time = t.toString().split('.');
				var minutes = time[1];
				var stringMinutes = '0.' + minutes;
				var floatMinutes = parseFloat(stringMinutes);
				var realMinutes = Math.round(floatMinutes * 60);
				var realHours = time[0];
				var timeString;
				var stundenString;

				if (realHours === "1") {
					stundenString = " Stunde";
				} else {
					stundenString = " Stunden";
				}

				if (realHours === "0" && realMinutes === 0) {
					timeString = "";
				} else if (realHours === "0") {
					timeString = realMinutes + " Minuten";
				} else if (realMinutes === 0) {
					timeString = realHours + stundenString;
				} else if (realMinutes === 60 || realMinutes === "60") {
					realMinutes = "0";
					realHours = parseInt(realHours, 0) + 1;
					timeString = realHours + stundenString + " " + realMinutes + " Minuten";
				} else {
					timeString = realHours + stundenString + " " + realMinutes + " Minuten";
				}
				return timeString;
			} else {
				return "";
			}

		},

		dateToString: function (month, year) {
			var monthNames = ["Jänner", "Februar", "März", "April", "Mai", "Juni",
				"Juli", "August", "September", "Oktober", "November", "Dezember"
			];

			var dateString = monthNames[month - 1] + "/" + year;
			return dateString;
		},

		getActivityHeaderText: function (multipleUser) {
			var text = "";
			if (multipleUser) {
				text = "Vorgangsinfo (Ressourcenübergreifend)";
			}

			return text;
		},

		typeToString: function (type) {
			var icon;
			if (type === "0") {
				icon = "sap-icon://building";
			} else if (type === "1") {
				icon = "sap-icon://home";
			} else if (type === "2") {
				icon = "sap-icon://headset";
			}

			return icon;

		},

		zammadIcon: function (orderType) {
			var path = "";
			if (orderType === "2000") {
				path = "images/zammad-logo.jpg";
			} else if (orderType === "1000") {
				path = "images/one.png";
			}
			return path;
		},

		showNewFromZammad: function (isNew) {
			if (isNew) {
				return true;
			} else {
				return false;
			}
		}
	};
});