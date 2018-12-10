app.controller("mainController", function($scope, $http)
{

$scope.helloWorld = "hello world";
var responseData = [];

$http.get('http://localhost:3000/Test').then(function(response)
{
  console.log("Hello Test");
});

$http.get('https://environment.data.gov.uk/flood-monitoring/id/stations/E3951/readings?latest').then(function(response)
{
  console.log("Gov api working")
});

$http.post('http://localhost:3000/GetSensorDetails').then(function(response)
{
  responseData = response.data;
}, function(response)
{
  responseData = "error";
});

//Google maps stuff

});


