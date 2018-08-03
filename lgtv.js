const wol = require('wake_on_lan');
const W3CWebSocket = require('websocket').w3cwebsocket;
const WebSocketAsPromised = require('websocket-as-promised');
const promisify = require('util').promisify;
const wake = promisify(wol.wake);
const Ping = require("ping-lite");

class LGTV {
    constructor(ip, mac, key, log) {
        this._ip = ip;
        this._mac = mac;
        this._key = key;
        this._log = log;
        this._connection = null;
        this._connectPromise = null;
    }

    async connect() {
        if (this._connectPromise)
            return this._connectPromise;

        this._connectPromise = (async () => {
            const connection = new WebSocketAsPromised('ws://' + this._ip + ':3000', {
                createWebSocket: url => new W3CWebSocket(url),
                packMessage: data => JSON.stringify(data),
                unpackMessage: message => JSON.parse(message),
                attachRequestId: (data, requestId) => Object.assign({id: requestId}, data),
                extractRequestId: data => data && data.id
            });

            this._connection = connection;

            connection.onError.addListener(e => {
                if (connection !== this._connection)
                    return;

                this._log('Connection error', e);
                this._connection.close();
                this._connectPromise = null;
                this._connection = null;
            });

            await this._connection.open();

            await this._handshake();
        })();

        return this._connectPromise;
    }

    async disconnect() {
        if (this._connection) {
            this._connection.close();
            this._connectPromise = null;
            this._connection = null;
        }
    }

    ping(timeout) {
        return Promise.race([
            new Promise(resolve => {
                (new Ping(this._ip)).send((error, ms) => {
                    if (error)
                        resolve(false);
                    else
                        resolve(true);                    
                })
            }),
            new Promise(resolve => setTimeout(() => {resolve(false);}, timeout))
        ]);
    }

    async _handshake() {
        const handshake = {"type":"register","payload":{"forcePairing":false,"pairingType":"PROMPT","manifest":{"manifestVersion":1,"appVersion":"1.1","signed":{"created":"20140509","appId":"com.lge.test","vendorId":"com.lge","localizedAppNames":{"":"LG Remote App","ko-KR":"리모컨 앱","zxx-XX":"ЛГ Rэмotэ AПП"},"localizedVendorNames":{"":"LG Electronics"},"permissions":["TEST_SECURE","CONTROL_INPUT_TEXT","CONTROL_MOUSE_AND_KEYBOARD","READ_INSTALLED_APPS","READ_LGE_SDX","READ_NOTIFICATIONS","SEARCH","WRITE_SETTINGS","WRITE_NOTIFICATION_ALERT","CONTROL_POWER","READ_CURRENT_CHANNEL","READ_RUNNING_APPS","READ_UPDATE_INFO","UPDATE_FROM_REMOTE_APP","READ_LGE_TV_INPUT_EVENTS","READ_TV_CURRENT_TIME"],"serial":"2f930e2d2cfe083771f68e4fe7bb07"},"permissions":["LAUNCH","LAUNCH_WEBAPP","APP_TO_APP","CLOSE","TEST_OPEN","TEST_PROTECTED","CONTROL_AUDIO","CONTROL_DISPLAY","CONTROL_INPUT_JOYSTICK","CONTROL_INPUT_MEDIA_RECORDING","CONTROL_INPUT_MEDIA_PLAYBACK","CONTROL_INPUT_TV","CONTROL_POWER","READ_APP_STATUS","READ_CURRENT_CHANNEL","READ_INPUT_DEVICE_LIST","READ_NETWORK_STATE","READ_RUNNING_APPS","READ_TV_CHANNEL_LIST","WRITE_NOTIFICATION_TOAST","READ_POWER_STATE","READ_COUNTRY_INFO"],"signatures":[{"signatureVersion":1,"signature":"eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw=="}]}}};

        let listener;
        let keyPromise;
        let messageId;

        if (this._key) {
            handshake.payload['client-key'] = this._key;
        } else {
            keyPromise = new Promise((resolve, reject) => {
                listener = message => {
                    if (!messageId)
                        return;

                    if (message.id != messageId)
                        return;

                    if (message.error)
                        reject(message.error);

                    if (!message.payload['client-key'])
                        return;

                    resolve(message.payload['client-key']);
                };
            });

            this._connection.onUnpackedMessage.addListener(listener);
        }
        
        const response = await this._connection.sendRequest(handshake);
        messageId = response.id;

        if (keyPromise) {
            this._key = await keyPromise;
            this._connection.onUnpackedMessage.removeListener(listener);
            this._log('LG TV key is ' + this._key + ' (Please put this in your configuration.)');
        }
    }

    async request(uri, payload) {
        await this.connect();
        let response = await this._connection.sendRequest({
            type: 'request',
            uri,
            payload
        });

        if (response.error)
            throw response.error;

        return response.payload;
    }

    getForegroundAppInfo() {
        return this.request('ssap://com.webos.applicationManager/getForegroundAppInfo');
    }

    switchInput(input) {
        return this.request('ssap://tv/switchInput', {
            inputId: input
        });
    }

    startApp(id, params) {
        return this.request('ssap://system.launcher/launch', Object.assign({
            id
        }, params));
    }

    listApps() {
        return this.request('ssap://com.webos.applicationManager/listApps');
    }

    getExternalInputList() {
        return this.request('ssap://tv/getExternalInputList');
    }

    pause() {
        return this.request('ssap://media.controls/pause');
    }

    play() {
        return this.request('ssap://media.controls/play');
    }

    stop() {
        return this.request('ssap://media.controls/stop');
    }

    rewind() {
        return this.request('ssap://media.controls/rewind');
    }

    fastForward() {
        return this.request('ssap://media.controls/fastForward');
    }

    setVolume(volume) {
        return this.request('ssap://audio/setVolume', {'volume' : 100 * volume});
    }

    async getVolume(volume) {
        const response = await this.request('ssap://audio/getVolume');
        return response.volume / 100;
    }

    isOff() {
        return Promise.race([
            (async () => {
                try {
                    await this.connect();
                    return !(await this.getForegroundAppInfo()).appId;
                } catch (e) {
                    return false;
                }
            })(),
            (async () => {
                if (!await this.ping(250))
                    return true;

                // In case the ping succeeds but the other requests eventually fail.
                return new Promise(resolve => setTimeout(() => {resolve(true);}, 2000));
            })()
        ]);
    }

    async isOn() {
        return !await this.isOff();
    }

    async turnOff() {
        if (!await this.isOff())
            await this.request('ssap://system/turnOff');
    }

    async turnOn() {
        for (let retries = 0; retries < 10; ++retries) {
            await wake(this._mac);
            try {
                await this.connect();
                if ((await this.getForegroundAppInfo()).appId)
                    break;
                throw 'off'
            } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

module.exports = LGTV;
