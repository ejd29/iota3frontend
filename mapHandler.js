var mymap = L.map('mapid').setView([51.283743, 1.079048], 11);

var markerList = [];
var sensor_details = [];
var testModeSensorValues = [];
var testModeFloodWarnings = [];

var testMode = false;
  
L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
maxZoom: 18,
id: 'mapbox.streets',
accessToken: 'pk.eyJ1IjoiYXA3MjAiLCJhIjoiY2pwZ3pxN3JoMG96ajN3bWRzMzU3cXRnbyJ9.C9FQwg1pArtjqQPonlbYuA'
}).addTo(mymap);

var noFloodWarningIcon = L.icon(
    {
        iconUrl: 'icons/okflood.png',
        iconSize: [18, 70],
        iconAnchor: [40,40], 
        popupAnchor: [-3, -76]
    });

    var floodWarningIcon = L.icon(
        {
            iconUrl: 'icons/floodwarning.png',
            iconSize: [18, 70],
            iconAnchor: [40,40], 
            popupAnchor: [-3, -76]
        });


//ONLOAD
$.post( "http://localhost:3000/GetSensorDetails", function( data ) 
{
    sensor_details = data;

    $.each(sensor_details, function(index, value)
    {
        if(value.MQTT == "True")
        {
            $.post("http://localhost:3000/GetMostRecentFloodWarningMQTT", {sensor_id: value.sensor_id, test_mode: testMode}, function(data)
            {
                if(data != null)
                {
                    var marker = L.marker([value.latitude, value.longitude]);

                    if(data.severity_level >= 1 && data.severity_level <= 3)
                    {
                        marker = L.marker([value.latitude, value.longitude], {icon: floodWarningIcon});
                    }else
                    {
                        marker = L.marker([value.latitude, value.longitude], {icon: noFloodWarningIcon});
                    }

                    marker.on("click", onMarkerClick);
                    marker.addTo(mymap);

                    markerList.push(marker);
                }
            });
        }else
        {
            var floodWarningUrl = "https://environment.data.gov.uk/flood-monitoring/id/floods?lat=" + value.latitude + "&long=" + value.longitude + "&dist=1"

            $.get(floodWarningUrl, function(data)
            {
                var marker = L.marker([value.latitude, value.longitude], {icon: noFloodWarningIcon});

                if(data.severity_level != undefined)
                {
                    if(data.severity_level >= 1 && data.severity_level <= 3)
                    {
                        marker = L.marker([value.latitude, value.longitude], {icon: floodWarningIcon});
                    }
                }
                
                marker.on("click", onMarkerClick);
                marker.addTo(mymap);

                markerList.push(marker);
            });
        }
    });

    checkUserSubscription();

    setInterval(function() {
        refreshFloodWarnings();
    }, 15 * 60 * 1000); //15 minutes
});

//MARKER CLICK HANDLING
function onMarkerClick(e)
{
    var marker = this;
    var sensor_id = null;
    var sensor_name = null;
    var isMQTT = false;

    //find sensor id from latitude 
    $.each(sensor_details, function(index, value)
    {
        if(marker.getLatLng().lat == value.latitude)
        {
            sensor_id = value.sensor_id;
            sensor_name = value.sensor_name;

            if(value.MQTT == "True")
            {
                isMQTT = true;
            }

            return;
        }
    });

    if(isMQTT == true)
    {
        //call backend for db readings
        $.post("http://localhost:3000/GetCurrentValueMQTT", { sensor_id: sensor_id, test_mode: testMode}, function(data)
        {
            var value_mm = data.value_mm;

            $.post("http://localhost:3000/GetLast24HoursOfDataMQTT", {sensor_id: sensor_id, test_mode: testMode}, function(data)
            {
                /*{
                    "ID": 1,
                    "sensor_id": "lairdc0ee400001012345",
                    "datetime": "12/4/2018, 11:31 AM",
                    "value_mm": 697
                } */

                var last24HoursDataMQTT = data;
                var dateTimeValues = [];
                var waterLevelValues = [];

                last24HoursDataMQTT.sort(function(a,b){
                    return moment(a.datetime).toDate() - moment(b.datetime).toDate();
                    //return new Date(b.dateTime) - new Date(a.dateTime);
                  });

                $.each(last24HoursDataMQTT, function(index, value)
                {
                    dateTimeValues[index] = value.datetime;
                    waterLevelValues[index] = value.value_mm;
                });

                var sensor_id_graph_id = sensor_id + "_graph";

                var trace1 = {
                    x: dateTimeValues,
                    y: waterLevelValues,
                    type: 'scatter'
                  };
                  
                  var datag = [trace1];

                  var layout = {
                    width:'200px'
                  };

                  $.post("http://localhost:3000/MqttSensorCheck", {sensor_id: sensor_id}, function(data)
                  {
                    if(marker.getPopup() != null)
                    {
                        if(data.sensorDown)
                        {
                            marker.getPopup().setContent("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<br> Sensor Online Status: <font color='red'> Offline" + "</font><div style='width:200px' id='" + sensor_id_graph_id + "'></div>");
                        }else
                        {
                            marker.getPopup().setContent("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<br> Sensor Online Status: <font color='green'> Online" + "</font><div style='width:200px' id='" + sensor_id_graph_id + "'></div>");
                        }

                        marker.getPopup().openPopup();
                        Plotly.newPlot(sensor_id_graph_id, datag, layout);
                    }else
                    {
                        if(data.sensorDown)
                        {
                            marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<br> Sensor Online Status: <font color='red'> Offline" + "</font><div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();
                        }else
                        {
                            marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<br> Sensor Online Status: <font color='green'> Online" + "</font><div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();
                        }

                        Plotly.newPlot(sensor_id_graph_id, datag, layout);
                    }
                  });                
            });
        });
    }else
    {
        //call api
        var query_url = "https://environment.data.gov.uk/flood-monitoring/id/stations/"+ sensor_id + "/readings?latest";

        $.get(query_url, function(data)
        {
            var value_m = -1;
            var value_mm = -1;

            if(data.items.length > 0)
            {
                value_m = data.items[0].value;
                value_mm = value_m * 1000;
            }

            var today = new Date();
            var yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);   

            query_url = "https://environment.data.gov.uk/flood-monitoring/id/stations/" + sensor_id +"/readings?since="+yesterday.toISOString(); 

            $.get(query_url, function(data)
            {
                var last24HoursDataGov = [];

                if(data.items != null)
                {
                    last24HoursDataGov = data.items;
                }
                
                var dateTimeValues = [];
                var waterLevelValues = [];

                last24HoursDataGov.sort(function(a,b){
                    return new Date(b.dateTime) - new Date(a.dateTime);
                  });

                $.each(last24HoursDataGov, function(index, value)
                {
                    dateTimeValues[index] = value.dateTime;
                    waterLevelValues[index] = value.value*1000;
                });

                var trace1 = {
                    x: dateTimeValues,
                    y: waterLevelValues,
                    type: 'scatter'
                  };
                  
                  var datag = [trace1];

                  var layout = {
                    width:'200px'
                  };

                var sensor_id_graph_id = sensor_id + "_graph";

                if(last24HoursDataGov.length > 0)
                {
                    marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<br> Sensor Online Status: <font color='green'> Online </font>" + "<div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();
                }else
                {
                    marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<br> Sensor Online Status: <font color='red'> Offline </font>" + "<div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();
                }

                Plotly.newPlot(sensor_id_graph_id, datag, layout);
            });

            marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm).openPopup();
        });
    }
}

function triggerFloodWarningTestMode(sensor_id)
{
    var MQTT = false;
    var marker = null;

    $.each(sensor_details, function(index, value)
    {
        if(value.sensor_id == sensor_id)
        {
            if(value.MQTT == "False")
            {
                //find corresponding marker
                $.each(markerList, function(index2, value2)
                {
                    if(value.latitude == value2.getLatLng().lat)
                    {
                        marker = value2;

                        $.get("http://localhost:3000/FakeGovFloodWarning", function(data)
                        {
                            if(data.severity_level >= 1 && data.severity_level <= 3)
                            {
                                marker.setIcon(floodWarningIcon);
                            }else
                            {
                                marker.setIcon(noFloodWarningIcon);
                            }
                        });
                    }
                });
            }
        }
    });


}

function addTestMQTTData(sensor_id, value_mm, datetimeIso)
{
    $.each(sensor_details, function(i, v)
    {
        if(sensor_id == v.sensor_id)
        {
            if(moment(datetimeIso).isValid() == false)
            {
                alert("Date time string is not valid");
            }else
            {
                var datetime = moment(datetimeIso).format("MM/D/YYYY, h:m A");

                $.post('http://localhost:3000/AddTestModeMQTTData', {sensor_id: sensor_id, value_mm: value_mm, datetime: datetime}, function(data)
                {
                    refreshFloodWarnings();
                });
            }
        }
    });
        
        refreshFloodWarnings();
}

function refreshFloodWarnings()
{
    $.each(sensor_details, function(i, v)
    {
        $.each(markerList, function(ii, vv)
        {
            if(v.latitude == vv.getLatLng().lat)
            {
                var marker = vv;

                if(v.MQTT == "True")
                {
                    $.post("http://localhost:3000/GetMostRecentFloodWarningMQTT", {sensor_id: v.sensor_id, test_mode: testMode} ,function(data)
                    {
                        if(data != null)
                        {
                            if(data.severity_level >= 1 && data.severity_level <= 3)
                            {
                                marker.setIcon(floodWarningIcon);
                            }else
                            {
                                marker.setIcon(noFloodWarningIcon);
                            }

                            console.log("refreshed sensor: " + v.sensor_id);
                        }
                    });
                }else
                {
                    if(!testMode)
                    {
                        var floodWarningUrl = "https://environment.data.gov.uk/flood-monitoring/id/floods?lat=" + v.latitude + "&long=" + v.longitude + "&dist=1"

                        $.get(floodWarningUrl, function(data)
                        {
                            if(data!=null)
                            {
                                if(data.severity_level >= 1 && data.severity_level <= 3)
                                {
                                    marker.setIcon(floodWarningIcon);
                                }else
                                {
                                    marker.setIcon(noFloodWarningIcon);
                                }

                            console.log("refreshed sensor: " + v.sensor_id);
                            }
                        });
                    }
                }
            }
        });
    });   
}


//first argument: method name
//second argument: parameters
function parseConsole(command)
{
    var arguments = command.split(" ");

    switch(arguments[0].toLowerCase())
    {
        case 'refreshfloodwarnings':
            refreshFloodWarnings();
            break;

        case 'addmqttdata':
            var sensor_id = arguments[1];
            var value_mm = arguments[2];
            var datetime = arguments[3];

            if(datetime == "now")
            {
                datetime = new Date();
            }

            addTestMQTTData(sensor_id, value_mm, datetime);
            break;
        
        case 'triggergovfloodwarning':
            var sensor_id = arguments[1];
            triggerFloodWarningTestMode(sensor_id)
            break;

        case 'wipealldummydata':
            $.post("http://localhost:3000/WipeAllDummyData", function(data)
            {
                //de nada
            });

            $.post("http://localhost:3000/WipeAllDummyFloodWarnings", function(data)
            {
                //de nada
            });
            break;

        default:
            alert("invalid command");
    }
}

function checkUserSubscription()
{
    $.post("http://localhost:3000/CheckUserSubscription", function(data)
    {
        if(data.latitude > 0 && data.longitude > 0)
        {
            //call flood alert
            var floodWarningUrl = "https://environment.data.gov.uk/flood-monitoring/id/floods?lat=" + data.latitude + "&long=" + data.longitude + "&dist=5";

            $.get(floodWarningUrl, function(data)
            {
                if(data.items.length == 0)
                {
                    $("#floodAlertMessage").text("There are no flood alerts in your area");
                }else
                {
                    $("#floodAlertMessage").text("There are flood alerts within a 5 mile radius of your postcode");
                }
            });
        }
    });
}

function addUserSubscription(postCode)
{
    //use api to find lat long for postcode
    var query_url = "http://api.postcodes.io/postcodes/" + postCode;

    $.get(query_url, function(data)
    {
        var latitude = data.result.latitude;
        var longitude = data.result.longitude;

        $.post("http://localhost:3000/SubscribeUserLocation", {latitude: latitude, longitude: longitude}, function(data)
        {
            if(data == "200")
            {
                checkUserSubscription();
            }
        });
    });
}

//Button Handlers

$("#executeCommand").on("click", function()
{
    var commandInput = $("#commandInput").val();
    $('#exampleModal').modal('hide');
    parseConsole(commandInput);
});

$("#subscribe").on("click", function()
{
    var subscribeInput = $("#postcodeSubscribe").val();
    addUserSubscription(subscribeInput);
});

function KeyPress(e) 
{
    var evtobj = window.event? event : e

    if (evtobj.keyCode == 90 && evtobj.ctrlKey)
    {
        testMode = !testMode;
        var message = testMode ? "Test mode is now enabled" : "Test mode is disabled"
        
        alert(message);
        refreshFloodWarnings();
    }

    if (evtobj.keyCode == 73 && evtobj.ctrlKey && testMode)
    {
        $('#exampleModal').modal('show');
    }
}

$(document).keydown(function(e)
{ 
    KeyPress(e);
});