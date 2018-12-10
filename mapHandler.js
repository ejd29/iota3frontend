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

var greenIcon = L.icon({
    iconUrl: 'leaf-green.png',
    shadowUrl: 'leaf-shadow.png',

    iconSize:     [38, 95], // size of the icon
    shadowSize:   [50, 64], // size of the shadow
    iconAnchor:   [22, 94], // point of the icon which will correspond to marker's location
    shadowAnchor: [4, 62],  // the same for the shadow
    popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
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
                        var marker = L.marker([value.latitude, value.longitude], {icon: noFloodWarningIcon});
                    }else
                    {
                        var marker = L.marker([value.latitude, value.longitude], {icon: floodWarningIcon});
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
    var isMQTT = false;

    //find sensor id from latitude 
    $.each(sensor_details, function(index, value)
    {
        if(marker.getLatLng().lat == value.latitude)
        {
            sensor_id = value.sensor_id;

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

                $.each(last24HoursDataMQTT, function(index, value)
                {
                    dateTimeValues[index] = value.datetime;
                    waterLevelValues[index] = value.value_mm;
                });

                var sensor_id_graph_id = sensor_id + "_graph";
                marker.bindPopup("Latest sensor reading (mm): " + value_mm + "<div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();

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
                marker.bindPopup("Latest sensor reading (mm): " + value_mm + "<div style='width:200px' id='" + sensor_id_graph_id + "'></div>", {maxWidth: "auto"}).openPopup();

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

            marker.bindPopup("Latest sensor reading (mm): " + value_mm).openPopup();
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
            if(value.MQTT == "True")
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
                $.post('http://localhost:3000/AddTestModeMQTTData', {sensor_id: sensor_id, value_mm: value_mm, datetime: moment(datetimeIso)}, function(data)
                {
                    refreshFloodWarnings();
                });
            }
        }
    });
        //updateFloodWarnings
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

    switch(arguments[0])
    {
        case 'refreshFloodWarnings':
            refreshFloodWarnings();
            break;

        case 'addTestMQTTData':
            var sensor_id = arguments[1];
            var value_mm = arguments[2];
            var datetime = arguments[3];

            addTestMQTTData(sensor_id, value_mm, datetime);
            break;
        
        case 'toggleFloodWarningTestMode':
            var sensor_id = arguments[1];
            var warning = arguments[2];

            toggleFloodWarningTestMode(sensor_id, warning)
            break;
    }
}


function KeyPress(e) {
    var evtobj = window.event? event : e

    if (evtobj.keyCode == 90 && evtobj.ctrlKey)
    {
        testMode = !testMode;
        var message = testMode ? "Test mode is now enabled" : "Test mode is disabled"
        
        alert(message);
    }

    if (evtobj.keyCode == 73 && evtobj.ctrlKey)
    {
        
    }
}

$(document).keydown(function(e)
{ 
    KeyPress(e);
});