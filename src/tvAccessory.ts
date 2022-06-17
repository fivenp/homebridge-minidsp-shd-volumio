import {
  CharacteristicValue,
  Logger,
  PlatformAccessory,
  Service,
} from 'homebridge';
import fetch from 'node-fetch';
import io from 'socket.io-client';

import { SHDPlatform } from './platform';

export class SHDTvAccessory {
  private tvService: Service;

  private state = {
    Active: true,
    ActiveIdentifier: 0,
    APIUrl: this.platform.config.api,
  };

  private deviceName: string;
  private log: Logger;
  private socket;

  private sources = [
    {
      name: 'TOSLINK',
      type: '2',
      activeValue: '1',
      remoteId: '1',
    },
    {
      name: 'RCA',
      type: '2',
      activeValue: '2',
      remoteId: '4',
    },
    {
      name: 'STREAMING',
      type: '2',
      activeValue: '3',
      remoteId: '99',
    },
    {
      name: 'SPDIF',
      type: '1',
      activeValue: '4',
      remoteId: '2',
    },
    {
      name: 'AES-EBU',
      type: '3',
      activeValue: '5',
      remoteId: '3',
    },
    {
      name: 'XLR',
      type: '3',
      activeValue: '6',
      remoteId: '5',
    },
    {
      name: 'USB',
      type: '3',
      activeValue: '7',
      remoteId: '6',
    },
  ];

  constructor(
    private readonly platform: SHDPlatform,
    private readonly accessory: PlatformAccessory
  ) {
    const Characteristic = this.platform.Characteristic;

    this.log = platform.log;
    this.deviceName = 'SHD Input';
    this.socket = io.connect(`${this.state.APIUrl}:3000`);

    // Get initial state and listen for updates
    this.socket.on('pushState', this.updateFromSocket.bind(this));
    this.socket.emit('getState', '');

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'MiniDSP')
      .setCharacteristic(Characteristic.Model, 'SHD')
      .setCharacteristic(Characteristic.SerialNumber, '---------');

    this.tvService =
      this.accessory.getService(this.platform.Service.Television) ||
      this.accessory.addService(this.platform.Service.Television);

    this.tvService
      .setCharacteristic(this.platform.Characteristic.Name, this.deviceName)
      .setCharacteristic(Characteristic.ConfiguredName, this.deviceName)
      .setCharacteristic(
        Characteristic.SleepDiscoveryMode,
        Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
      );

    this.tvService.setCharacteristic(
      Characteristic.ActiveIdentifier,
      this.state.ActiveIdentifier
    );

    this.tvService
      .getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .onGet(this.getActive.bind(this));

    this.tvService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .onSet(this.setActiveIdentifier.bind(this))
      .onGet(this.getActiveIdentifier.bind(this));

    for (const i in this.sources) {
      const source = this.sources[i];
      const index = parseInt(i) + 1;
      const serviceName = `INPUT+${index}`;

      const inputService =
        this.accessory.getService(serviceName) ||
        this.accessory.addService(
          this.platform.Service.InputSource,
          serviceName,
          `${source.name}`
        );

      this.log.info('[%s] Adding inputService ->', this.deviceName, source);

      inputService
        .setCharacteristic(Characteristic.Identifier, parseInt(i) + 1)
        .setCharacteristic(Characteristic.ConfiguredName, source.name)
        .setCharacteristic(
          Characteristic.IsConfigured,
          Characteristic.IsConfigured.CONFIGURED
        )
        .setCharacteristic(
          Characteristic.InputSourceType,
          source.type || Characteristic.InputSourceType.TUNER
        );

      this.tvService.addLinkedService(inputService);
    }
  }

  a;

  async setActive(value: CharacteristicValue) {
    try {
      if (value === 1) {
        this.log.info('[%s] Power -> [on]', this.deviceName, true);
        this.state.Active = true;
      } else {
        this.log.info('[%s] Power -> [off]', this.deviceName, false);
        this.state.Active = false;
      }
    } catch (error) {
      this.log.error('[%s] Error setting state:', this.deviceName, error);
    }
  }

  updateFromSocket() {
    this.log.debug('[%s] Got new state from socket...', this.deviceName);
    this.getActiveIdentifier();
  }

  async getActive(): Promise<CharacteristicValue> {
    this.log.debug(
      '[%s] Getting current state..',
      this.deviceName,
      this.state.Active
    );
    return this.state.Active;
  }

  async setActiveIdentifier(value: CharacteristicValue) {
    const sourceIndex = parseInt(value as string) - 1;
    const source = this.sources[sourceIndex];

    this.log.info('[%s] Selecting input -> [%s]', this.deviceName, source.name);

    try {
      this.socket.emit('browseLibrary', { uri: `inputs/id/${value}` });
      this.state.ActiveIdentifier = value as number;
      this.tvService
        .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
        .updateValue(value);
    } catch (error) {
      this.log.error('[%s] Error selecting input:', this.deviceName, error);
    }
  }

  async getActiveIdentifier(): Promise<CharacteristicValue> {
    const response = await fetch(`${this.state.APIUrl}/api/v1/getState`);
    const data = await response.json();
    let currentlyActive = '3';

    this.sources.forEach((source) => {
      if (data.title === source.name) {
        currentlyActive = source.activeValue;
      }
    });

    this.log.debug(
      '[%s] Getting active input..',
      this.deviceName,
      this.state.ActiveIdentifier,
      data.title,
      currentlyActive
    );

    if (parseInt(currentlyActive) !== this.state.ActiveIdentifier) {
      this.log.debug(
        '[%s] Switch active input from... to...',
        this.deviceName,
        this.state.ActiveIdentifier,
        currentlyActive
      );
      this.state.ActiveIdentifier = parseInt(currentlyActive);
      this.tvService
        .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
        .updateValue(currentlyActive);
    }

    return this.state.ActiveIdentifier;
  }
}
