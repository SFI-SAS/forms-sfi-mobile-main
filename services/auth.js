/**
 * Servicio de Autenticación
 * Manejo robusto de login, logout y validación de tokens similar a la versión web
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const AUTH_TOKEN_KEY = "authToken";
const USER_INFO_KEY = "user_info_offline";
const BACKEND_URL_KEY = "backend_url";
const IS_LOGGED_OUT_KEY = "isLoggedOut";
const TOKEN_TIMESTAMP_KEY = "token_timestamp";

// Duración del token: 24 horas (como en versión web)
const TOKEN_EXPIRATION_TIME = 24 * 60 * 60 * 1000;

/**
 * Obtener backend URL
 */
export const getBackendUrl = async () => {
  const url = await AsyncStorage.getItem(BACKEND_URL_KEY);
  return url || "";
};

/**
 * Validar si el token ha expirado
 */
const isTokenExpired = async () => {
  try {
    const timestamp = await AsyncStorage.getItem(TOKEN_TIMESTAMP_KEY);
    if (!timestamp) return true;

    const tokenAge = Date.now() - parseInt(timestamp);
    return tokenAge > TOKEN_EXPIRATION_TIME;
  } catch (error) {
    console.error("❌ Error verificando expiración de token:", error);
    return true;
  }
};

/**
 * Guardar token con timestamp
 */
const saveTokenWithTimestamp = async (token) => {
  await AsyncStorage.multiSet([
    [AUTH_TOKEN_KEY, token],
    [TOKEN_TIMESTAMP_KEY, Date.now().toString()],
  ]);
};

/**
 * Verificar conectividad
 */
const checkConnectivity = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected;
};

/**
 * Login - Similar a la versión web
 */
export const login = async (email, password) => {
  try {
    console.log("🔐 Iniciando login...");

    // Verificar conectividad
    const isOnline = await checkConnectivity();
    if (!isOnline) {
      throw new Error(
        "No hay conexión a internet. Por favor, verifica tu conexión."
      );
    }

    const backendUrl = await getBackendUrl();
    if (!backendUrl) {
      throw new Error(
        "URL del backend no configurada. Por favor, configura el servidor en Settings."
      );
    }

    // Realizar petición de login
    const response = await fetch(`${backendUrl}/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        username: email,
        password: password,
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
          errorData.message ||
          `Error ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.access_token) {
      throw new Error("Token no recibido del servidor");
    }

    // Guardar token con timestamp
    await saveTokenWithTimestamp(data.access_token);
    await AsyncStorage.setItem(IS_LOGGED_OUT_KEY, "false");

    console.log("✅ Login exitoso");

    // Obtener información del usuario
    await fetchUserInfo(data.access_token);

    return {
      success: true,
      token: data.access_token,
    };
  } catch (error) {
    console.error("❌ Error en login:", error);
    return {
      success: false,
      error: error.message || "Error al iniciar sesión",
    };
  }
};

/**
 * Obtener información del usuario autenticado
 */
export const fetchUserInfo = async (token = null) => {
  try {
    const authToken = token || (await AsyncStorage.getItem(AUTH_TOKEN_KEY));
    if (!authToken) {
      throw new Error("No hay token de autenticación");
    }

    const backendUrl = await getBackendUrl();
    const response = await fetch(`${backendUrl}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Error obteniendo información del usuario");
    }

    const userInfo = await response.json();

    // Guardar información del usuario
    await AsyncStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));

    console.log("✅ Información de usuario obtenida:", userInfo.email);

    return {
      success: true,
      user: userInfo,
    };
  } catch (error) {
    console.error("❌ Error obteniendo info de usuario:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Validar token actual
 */
export const validateToken = async () => {
  try {
    console.log("🔍 Validando token...");

    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      console.log("❌ No hay token guardado");
      return { valid: false, reason: "no_token" };
    }

    // Verificar si el token ha expirado por tiempo
    const expired = await isTokenExpired();
    if (expired) {
      console.log("⏰ Token expirado por tiempo");
      await logout();
      return { valid: false, reason: "expired" };
    }

    // Verificar conectividad
    const isOnline = await checkConnectivity();
    if (!isOnline) {
      console.log("📴 Sin conexión - usando token en caché");
      return { valid: true, token, offline: true };
    }

    // Validar token con el servidor
    const backendUrl = await getBackendUrl();
    const response = await fetch(`${backendUrl}/auth/validate-token`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.log("❌ Token inválido en servidor");
      await logout();
      return { valid: false, reason: "invalid_server" };
    }

    console.log("✅ Token válido");
    return { valid: true, token };
  } catch (error) {
    console.error("❌ Error validando token:", error);
    // En caso de error de red, permitir continuar con el token en caché
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      return { valid: true, token, offline: true };
    }
    return { valid: false, reason: "error" };
  }
};

/**
 * Logout - Limpiar sesión completamente
 */
export const logout = async () => {
  try {
    console.log("🚪 Cerrando sesión...");

    // Marcar como logged out
    await AsyncStorage.setItem(IS_LOGGED_OUT_KEY, "true");

    // Limpiar datos de autenticación
    await AsyncStorage.multiRemove([
      AUTH_TOKEN_KEY,
      TOKEN_TIMESTAMP_KEY,
      USER_INFO_KEY,
    ]);

    console.log("✅ Sesión cerrada correctamente");

    return { success: true };
  } catch (error) {
    console.error("❌ Error en logout:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Obtener token actual
 */
export const getAuthToken = async () => {
  return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
};

/**
 * Verificar si el usuario ha cerrado sesión manualmente
 */
export const isLoggedOut = async () => {
  const loggedOut = await AsyncStorage.getItem(IS_LOGGED_OUT_KEY);
  return loggedOut === "true";
};

/**
 * Refrescar token (renovar timestamp si es válido)
 */
export const refreshToken = async () => {
  try {
    const validation = await validateToken();
    if (validation.valid && validation.token) {
      // Renovar timestamp
      await AsyncStorage.setItem(TOKEN_TIMESTAMP_KEY, Date.now().toString());
      console.log("🔄 Token renovado");
      return { success: true };
    }
    return { success: false, reason: validation.reason };
  } catch (error) {
    console.error("❌ Error refrescando token:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Obtener información del usuario guardada
 */
export const getCachedUserInfo = async () => {
  try {
    const userInfoStr = await AsyncStorage.getItem(USER_INFO_KEY);
    if (userInfoStr) {
      return JSON.parse(userInfoStr);
    }
    return null;
  } catch (error) {
    console.error("❌ Error obteniendo info de usuario en caché:", error);
    return null;
  }
};

export default {
  login,
  logout,
  validateToken,
  getAuthToken,
  isLoggedOut,
  fetchUserInfo,
  refreshToken,
  getCachedUserInfo,
  getBackendUrl,
};
