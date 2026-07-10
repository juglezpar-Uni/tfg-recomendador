import { NativeModules, NativeEventEmitter,  PermissionsAndroid, Platform } from 'react-native';
import { getSettingValue } from '../realmSchemas/SettingsServices';
import {existsActivity,storeActivity, getAllActivities} from '../realmSchemas/RealmServices';
import uuid from 'react-native-uuid';
// P2P (Nearby Connections) is an Android-only native module. On iOS the
// module is absent, so we short-circuit here to avoid
// `new NativeEventEmitter(undefined)` which throws an Invariant Violation
// at module import time on iOS and aborts the whole JS bundle.
const P2PModule =
  Platform.OS === 'android' ? NativeModules.P2PModule : null;
const p2pEvents = P2PModule ? new NativeEventEmitter(P2PModule) : null;

/**
 * Solicita permisos necesarios para conexiones P2P en Android.
 * Incluye permisos de Bluetooth, Wi-Fi cercano y ubicación, dependiendo de la versión de Android.
 *
 * @async
 * @function requestP2PPermissions
 * @returns {Promise<boolean>} `true` si todos los permisos fueron concedidos, `false` en caso contrario.
 */
export async function requestP2PPermissions() {
    try {
        if (Platform.OS === "android") {
        const permissions = [];

        if (Platform.Version >= 31) { // Android 12+
            permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
            );
        }

        if (Platform.Version >= 33) { // Android 13+
            permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
        }

        permissions.push(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
        );

        const granted = await PermissionsAndroid.requestMultiple(permissions);

        const allGranted = Object.values(granted).every(
            (status) => status === PermissionsAndroid.RESULTS.GRANTED
        );

        return allGranted;
        }
        return true;
    } catch (err) {
        console.warn(err);
        return false;
    }
}

/**
 * Verifica si los permisos necesarios para conexiones P2P están concedidos en Android.
 * Incluye Bluetooth, Wi-Fi cercano y ubicación según la versión de Android.
 *
 * @async
 * @function checkP2PPermissions
 * @returns {Promise<boolean>} `true` si todos los permisos ya están concedidos, `false` en caso contrario.
 */
export async function checkP2PPermissions() {
    try {
        if (Platform.OS === "android") {
        const permissions = [];

        if (Platform.Version >= 31) { // Android 12+
            permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
            );
        }

        if (Platform.Version >= 33) { // Android 13+
            permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
        }

        permissions.push(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
        );

        // Comprobar cada permiso
        const results = await Promise.all(
            permissions.map((perm) => PermissionsAndroid.check(perm))
        );

        return results.every((granted) => granted === true);
        }
        return true; // en iOS no se piden explícitamente
    } catch (err) {
        console.warn(err);
        return false;
    }
}
  
/**
 * Inicia el servicio P2P con un nombre de servicio y un identificador de usuario.
 *
 * @function startP2P
 * @param {string} serviceName - Nombre del servicio a anunciar.
 * @param {string} userId - Identificador único del usuario.
 * @returns {Promise<void>|any} Promesa o resultado del módulo nativo al iniciar el servicio.
 */
export const startP2P = (serviceName, userId) => {
    if (!P2PModule) return;
    return P2PModule.start(serviceName, userId);
};

/**
 * Detiene el servicio P2P.
 *
 * @function stopP2P
 * @returns {Promise<void>|any} Promesa o resultado del módulo nativo al detener el servicio.
 */
export const stopP2P = () => {
    if (!P2PModule) return;
    return P2PModule.stop();
};

/**
 * Verifica si el servicio P2P está detenido.
 *
 * @async
 * @function isStopped
 * @returns {Promise<boolean>} `true` si está detenido, `false` si está en ejecución.
 */
export const isStopped = async () => {
    if (!P2PModule) return true;
    return await P2PModule.isStopped();
};


/**
 * Envía un mensaje a través del servicio P2P.
 * @param {string} message - Mensaje a enviar (se recomienda JSON stringificado).
 * @returns {Promise<any>} Resultado de la llamada nativa.
 */
export const sendData = (message) => {
    if (!P2PModule) return;
    console.log("[P2P] Enviando mensaje:", message);
    return P2PModule.sendData(message);
};
  

function sendInitialSync() {
    if (!P2PModule) return;
    const data = getLocalActivitiesAsJson();
    P2PModule.sendData(data);
}

/**
 * Se suscribe a los mensajes recibidos por P2P.
 *
 * @function subscribeToMessages
 * @param {function(string|object):void} callback - Función que será llamada cada vez que se reciba un mensaje.
 * @returns {function} Función para cancelar la suscripción.
 */
export const subscribeToMessages = (callback) => {
    if (!p2pEvents) return () => {};
    const subscription = p2pEvents.addListener("onDataReceived", callback);
    return () => subscription.remove();
};


/**
 * Se suscribe al evento de conexión establecida con otro dispositivo.
 *
 * @function subscribeToConnected
 * @param {function(string):void} callback - Función que será llamada con el endpointId.
 * @returns {function} Función para cancelar la suscripción.
 */
export const subscribeToConnected = (callback) => {
    if (!p2pEvents) return () => {};
    const subscription = p2pEvents.addListener("onConnected", callback);
    return () => subscription.remove();
  };
  

/**
 * Procesa un mensaje P2P recibido.
 * @param {string|object} rawMessage - Mensaje recibido desde el módulo P2P.
 */
export function processP2PMessage(rawMessage) {
    let message;
    try {
        // Si llega como string, parsearlo
        message = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
    } catch (err) {
        console.warn('[P2P] Mensaje inválido:', rawMessage, err);
        return;
    }

    if (!message.type) {
        console.warn('[P2P] Mensaje sin tipo definido:', message);
        return;
    }

    switch (message.type) {
        case 'activityShared':
        // Procesar actividad recibida
        const activity = message.activity;
        console.log('[P2P] Actividad recibida:', activity);

        if(!existsActivity(activity)){
            // Guardar en Realm solo si no existe
            storeActivity(activity);
        }

        break;

        case 'SYNC_DATA': {
            (message.activities || []).forEach(activity => {
              console.log('[P2P] Actividad sync:', activity);
              storeActivity(activity);
            });
            break;
          }
        // FUTURO: otros tipos de mensajes P2P
        // case 'anotherType':
        //   processAnotherType(message);
        //   break;

        default:
        console.warn('[P2P] Tipo de mensaje desconocido:', message.type);
    }
}

/**
 * Inicializa el servicio P2P si está habilitado en los settings del usuario.
 * - Solicita permisos si es necesario.
 * - Inicia el servicio P2P.
 * - Se suscribe a la recepción de mensajes.
 *
 * @param {string} token - Token único del usuario.
 */
export async function initializeP2PIfEnabled(token) {
    if (Platform.OS !== 'android') {
      console.log('[P2P] Not available on this platform, skipping initialization');
      return;
    }
    const enabled = getSettingValue(token, 'P2P_ENABLED');
    if (enabled) {
      const granted = await requestP2PPermissions();
      if (granted) {
        const uniqueId = uuid.v4();
        await startP2P('R-Rules', uniqueId);
  
        // Suscripción a mensajes normales
        subscribeToMessages(processP2PMessage);
  
        // Suscripción a evento de conexión
        subscribeToConnected((endpointId) => {
          console.log("[P2P] Conexión establecida con", endpointId);
          sendInitialSync();
        });
      }
    }
  }
  

/**
 * Prepara una Activity para enviar por P2P.
 * Se usa cuando un usuario valora positivamente (>3),
 * pero no se comparte el rating.
 * @param {Activity} activity - Objeto Activity de Realm.
 * @returns {object} Objeto serializable para P2P.
 */
export function mapActivityForP2P(activity) {
    return {
      type: "activityShared",
      activity: {
        id: activity.id,
        authorId: activity.authorId,
        title: activity.title,
        type: activity.type,
        description: activity.description,
        begin: activity.begin ? activity.begin.getTime() : null,
        ending: activity.ending ? activity.ending.getTime() : null,
        latitude: activity.latitude ?? null,
        longitude: activity.longitude ?? null,
        img: activity.img ?? null,
      },
      timestamp: Date.now(),
    };
}


function getLocalActivitiesAsJson() {
    const activities = getAllActivities();
    return JSON.stringify({
      type: "SYNC_DATA",
      activities: activities.map(a => ({
        id: a.id,
        authorId: a.authorId,
        title: a.title,
        type: a.type,
        description: a.description,
        latitude: a.latitude,
        longitude: a.longitude,
        img: a.img,
        begin: a.begin,
        ending: a.ending,
      })),
    });
  }
  