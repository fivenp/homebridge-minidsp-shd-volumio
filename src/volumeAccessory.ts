import {
  Logger,
  Service,
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';
import fetch from 'node-fetch';
import io from 'socket.io-client';

import { SHDPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SHDVolumeAccessory {
  private bulbService: Service;
  private deviceName: string;
  private log: Logger;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state = {
    On: true,
    APIUrl: this.platform.config.api,
    Volume: this.platform.config.defaultVolume,
  };

  private socket;

  constructor(
    private readonly platform: SHDPlatform,
    private readonly accessory: PlatformAccessory
  ) {
    this.log = platform.log;
    this.deviceName = 'SHD Volume';
    this.socket = io.connect(`${this.state.APIUrl}:3000`);

    // Get initial state and listen for updates
    this.socket.on('pushState', this.updateFromSocket.bind(this));
    this.socket.emit('getState', '');

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'MiniDSP')
      .setCharacteristic(this.platform.Characteristic.Model, 'SHD')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '--------');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.bulbService =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.bulbService.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.exampleDisplayName
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.bulbService
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this)); // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.bulbService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setVolume.bind(this)); // SET - bind to the 'setVolume` method below
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn() {
    this.state.On = true;
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.bulbService.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    const isOn = true;
    const currentVolume = await this.getVolume();

    this.bulbService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .updateValue(currentVolume);

    this.log.debug(
      '[%s] Get Initial Volume ->',
      this.deviceName,
      currentVolume
    );
    return isOn;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  async setVolume(value: CharacteristicValue) {
    // implement your own code to set the brightness
    this.state.Volume = value as number;
    const newVolume = this.state.Volume;
    this.socket.emit('volume', newVolume);
    this.log.info('[%s] Set Volume -> ', this.deviceName, newVolume);
  }

  async getVolume() {
    const response = await fetch(`${this.state.APIUrl}/api/v1/getState`);
    const data = await response.json();
    return data.volume;
  }

  updateFromSocket() {
    this.log.debug('[%s] Got new state from socket...', this.deviceName);
    this.getOn();
  }
}
