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
        iconSize: [25, 80],
        popupAnchor: [-3, -76]
    });

    var floodWarningIcon = L.icon(
        {
            iconUrl: 'icons/floodwarning.png',
            iconSize: [25, 80],
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

                    if(data.severity_level == "No concerns")
                    {
                        marker = L.marker([value.latitude, value.longitude], {icon: noFloodWarningIcon});
                    }else
                    {
                        marker = L.marker([value.latitude, value.longitude], {icon: floodWarningIcon});
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
                var marker = L.marker([value.latitude, value.longitude]);

                if(data.items.length == 0)
                {
                    marker = L.marker([value.latitude, value.longitude], {icon: noFloodWarningIcon});
                }else
                {
                    marker = L.marker([value.latitude, value.longitude], {icon: floodWarningIcon});
                }
                
                marker.on("click", onMarkerClick);
                marker.addTo(mymap);

                markerList.push(marker);
            });
        }
    });

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

                if(marker.getPopup() != null)
                {
                    marker.getPopup().setContent("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<div style='width:200px' id='" + sensor_id_graph_id + "'></div>");
                    marker.getPopup().openPopup();
                    Plotly.newPlot(sensor_id_graph_id, datag, layout);
                }else
                {
                    marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();
                    Plotly.newPlot(sensor_id_graph_id, datag, layout);
                }
                                   
            });
        });
    }else
    {
        //call api
        var query_url = "https://environment.data.gov.uk/flood-monitoring/id/stations/"+ sensor_id + "/readings?latest";

        $.get(query_url, function(data)
        {
            var value_m = data.items[0].value;
            value_mm = value_m * 1000;

            var today = new Date();
            var yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);   

            query_url = "https://environment.data.gov.uk/flood-monitoring/id/stations/" + sensor_id +"/readings?since="+yesterday.toISOString(); 

            $.get(query_url, function(data)
            {
                var last24HoursDataGov = data.items;
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

                var sensor_id_graph_id = sensor_id + "_graph";
                marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm + "<div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();

                var trace1 = {
                    x: dateTimeValues,
                    y: waterLevelValues,
                    type: 'scatter'
                  };
                  
                  var datag = [trace1];

                  var layout = {
                    width:'200px'
                  };
                  
                  Plotly.newPlot(sensor_id_graph_id, datag, layout);
            });

            marker.bindPopup("Sensor Name: " + sensor_name + "<br>Latest sensor reading (mm): " + value_mm).openPopup();
        });
    }
}

function toggleFloodWarningTestMode(sensor_id, warning)
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

                        if(warning == 0)
                        {
                            marker.setIcon(noFloodWarningIcon);
                        }else
                        {
                            marker.setIcon(floodWarningIcon);
                        }
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
                            if(data.severity_level == "No concerns")
                            {
                                marker.setIcon(noFloodWarningIcon);
                            }else
                            {
                                marker.setIcon(floodWarningIcon);
                            }

                            console.log("refreshed sensor: " + v.sensor_id);
                        }
                    });
                }else
                {
                    if(!testMode)
                    {
                        var floodWarningUrl = "https://environment.data.gov.uk/flood-monitoring/id/floods?lat=" + value.latitude + "&long=" + value.longitude + "&dist=1"

                        $.get(floodWarningUrl, function(data)
                        {
                            if(data.items.length == 0)
                            {
                                marker.setIcon(noFloodWarningIcon);
                            }else
                            {
                                marker.setIcon(floodWarningIcon);
                            }

                            console.log("refreshed sensor: " + v.sensor_id);
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
        
        case 'togglefloodwarning':
            var sensor_id = arguments[1];
            var warning = arguments[2];

            toggleFloodWarningTestMode(sensor_id, warning)
            break;

        case 'wipealldummydata':
            
            $.post("http://localhost:3000/WipeAllDummyData", function(data)
            {
                //de nada
            });

            break;

        case 'wipealldummyfloodwarnings':

            $.post("http://localhost:3000/WipeAllDummyFloodWarnings", function(data)
            {
                //de nada
            });

            break;
    }
}

$("#executeCommand").on("click", function()
{
    var commandInput = $("#commandInput").val();
    $('#exampleModal').modal('hide');
    parseConsole(commandInput);
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