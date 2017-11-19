var Accessory, Service, Characteristic, UUIDGen;

// import { setTimeout } from "timers";
const _ = require('lodash');
const EventSource = require("eventsource");

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version
function NestThermostatSensor(log, config, api) {
  log("NestThermostatSensor Init");
  var platform = this;
  this.log = log;
  this.config = config;
  this.accessories = [];

  if (api) {
    // Save the API object as plugin needs to register new accessory via this object
    this.api = api;

    // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
    // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
    // Or start discover new accessories.
    this.api.on(
      "didFinishLaunching",
      function() {
        platform.log("DidFinishLaunching");
        this._initNestStream();
      }.bind(this)
    );
  }
}

NestThermostatSensor.prototype._initNestStream = function() {
  this.log("Init Nest Stream");

  let es = new EventSource("https://developer-api.nest.com/", {
    headers: {
      authorization: "Bearer " + this.config["token"]
    }
  });

  es.addEventListener(
    "open",
    function(event) {
      this.log("Nest Connection Opened");
    }.bind(this)
  );

  es.addEventListener(
    "error",
    function(event) {
      console.info(event);
    }.bind(this)
  );

  es.addEventListener(
    "put",
    function(event) {
      this._processNestPut(event);
    }.bind(this)
  );

  es.addEventListener(
    "keep-alive",
    function(event) {
      // do nothing
    }.bind(this)
  );

  es.addEventListener(
    "unhandled",
    function(event) {
      console.info(event);
    }.bind(this)
  );
};

NestThermostatSensor.prototype._processNestPut = function(event) {
  let eventData = JSON.parse(event.data);
  if (
    eventData.data &&
    eventData.data.devices &&
    eventData.data.devices.thermostats
  ) {
    _.forIn(eventData.data.devices.thermostats, (v, k) => {
      this._processSingleThermostat(k, v);
    });
  }
};

NestThermostatSensor.prototype._processSingleThermostat = function(id, info) {
  if (info.can_heat) {
    this._ensureSensorExists(id, info);
    let accessory = this.accessories.find(function(a) {
      return a.context.id == id;
    });
    if (accessory !== undefined) {
      let value = false;
      switch (info.hvac_state) {
        case "off":
          value = false;
          break;
        case "heating":
          value = true;
          break;
      }
      accessory
        .getService(Service.MotionSensor)
        .getCharacteristic(Characteristic.MotionDetected)
        .updateValue(value, null, "updateState");
    }
  }
};

NestThermostatSensor.prototype._ensureSensorExists = function(id, info) {
  if (
    this.accessories.find(function(a) {
      return a.context.id == id;
    }) === undefined
  ) {
    this.log(`Adding Sensor: ${info.name} Heat`);

    var uuid = UUIDGen.generate(id);

    var newAccessory = new Accessory(`${info.name} Heat`, uuid);
    // newAccessory.on("identify", function(paired, callback) {
    //   platform.log(accessory.displayName, "Identify!!!");
    //   callback();
    // });
    //   // Plugin can save context on accessory to help restore accessory in configureAccessory()
    newAccessory.context.id = id;

    //   // Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps
    newAccessory
      .addService(Service.MotionSensor, `${info.name} Heat`)
      .getCharacteristic(Characteristic.MotionDetected);
    //     .on("get", function(callback) {
    //       console.info(newAccessory.displayName, "Get State");
    //       callback(null, false);
    //     });

    this.accessories.push(newAccessory);
    this.api.registerPlatformAccessories(
      "homebridge-nest-thermostat-sensor",
      "NestThermostatSensor",
      [newAccessory]
    );
  }
};

// Function invoked when homebridge tries to restore cached accessory.
// Developer can configure accessory at here (like setup event handler).
// Update current value.
NestThermostatSensor.prototype.configureAccessory = function(accessory) {
  this.log(accessory.displayName, "Configure Accessory");
  var platform = this;

  // Set the accessory to reachable if plugin can currently process the accessory,
  // otherwise set to false and update the reachability later by invoking
  // accessory.updateReachability()
  accessory.reachable = true;

  // accessory.on("identify", function(paired, callback) {
  //   platform.log(accessory.displayName, "Identify!!!");
  //   callback();
  // });

  // if (accessory.getService(Service.MotionSensor)) {
  //   accessory
  //     .getService(Service.MotionSensor)
  //     .getCharacteristic(Characteristic.MotionDetected)
  //     .on("get", function(callback) {
  //       console.info(accessory.displayName, "Get State");
  //       callback(null, false);
  //     });

  //     var handler = () => {
  //       console.info(accessory.displayName, "Update State");
  //       accessory
  //       .getService(Service.MotionSensor)
  //       .getCharacteristic(Characteristic.MotionDetected)
  //       .updateValue(false, null, "updateState");

  //       setTimeout(handler, 1000);
  //     }

  //     setTimeout(handler, 1000);
  // }

  this.accessories.push(accessory);
};

module.exports = function(homebridge) {
  console.log("homebridge API version: " + homebridge.version);

  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  // For platform plugin to be considered as dynamic platform plugin,
  // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
  homebridge.registerPlatform(
    "homebridge-nest-thermostat-sensor",
    "NestThermostatSensor",
    NestThermostatSensor,
    true
  );
};
