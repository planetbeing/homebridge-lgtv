const LGTV = require('./lgtv');
let Service, Characteristic;

class HomebridgeLGTV {
    constructor(log, config) {
        this._log = log;
        this._lgtv = new LGTV(config.ip, config.mac, config.key, this._log);
    }

    getServices() {
        let informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "LG")
            .setCharacteristic(Characteristic.Model, "TV")
            .setCharacteristic(Characteristic.SerialNumber, "123-456-789");

        let switchService = new Service.Switch("LG TV");
        switchService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getSwitchOnCharacteristic.bind(this))
            .on('set', this.setSwitchOnCharacteristic.bind(this));

        this.informationService = informationService;
        this.switchService = switchService;
        return [informationService, switchService];
    }

    async getSwitchOnCharacteristic(next) {
        try {
            let isOn = await this._lgtv.isOn();
            this._log('LG TV isOn:', isOn);
            next(null, isOn);
        } catch (e) {
            next(e);
        }
    }

    async setSwitchOnCharacteristic(on, next) {
        this._log('LG TV set on:', on);
        if (on)
            await this._lgtv.turnOn();
        else
            await this._lgtv.turnOff();

        next();
    }
};

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-lgtv", "LG TV", HomebridgeLGTV);
};
