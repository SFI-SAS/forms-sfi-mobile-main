/**
 * OfflineManager.js
 * Sistema de gestión offline/online con funciones separadas
 *
 * REGLAS:
 * - ONLINE: Usar SOLO endpoints + actualizar AsyncStorage
 * - OFFLINE: Usar SOLO AsyncStorage
 * - NO mezclar datos de ambas fuentes
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { setCacheWithTTL, getCacheWithTTL } from "../utils/cacheManager";

// ============================================
// CONSTANTES
// ============================================

const CACHE_KEYS = {
  FORMS: "offline_forms",
  MY_FORMS: "my_forms_offline",
  PENDING_FORMS: "pending_forms_offline",
  FORM_DESIGN: "form_design_",
  FORM_QUESTIONS: "form_questions_",
  RESPONSES: "offline_responses",
  USER_INFO: "user_info_offline",
  APPROVALS: "approvals_offline",
  CORRELATIONS: "correlations_",
  INSTRUCTIVOS: "instructivos_",
  ALERT_MESSAGES: "alert_messages_",
  MATH_OPERATIONS: "math_operations_",
};

const CACHE_TTL = {
  SHORT: 5 * 60 * 1000, // 5 minutos
  MEDIUM: 30 * 60 * 1000, // 30 minutos
  LONG: 24 * 60 * 60 * 1000, // 24 horas
};

// ============================================
// ESTADO DE CONEXIÓN
// ============================================

let currentConnectionState = null;

/**
 * Inicializa el listener de conexión
 */
export const initializeOfflineManager = () => {
  NetInfo.addEventListener((state) => {
    const wasOffline = currentConnectionState === false;
    const isNowOnline = state.isConnected === true;

    currentConnectionState = state.isConnected;

    // Detectar cambio de offline a online
    if (wasOffline && isNowOnline) {
      console.log("🌐 [OfflineManager] Conexión restaurada - Sincronizando...");
      onConnectionRestored();
    } else if (!state.isConnected) {
      console.log("📵 [OfflineManager] Modo offline activado");
    }
  });
};

/**
 * Verifica si hay conexión
 */
export const isOnline = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected === true;
};

/**
 * Evento cuando se restaura la conexión
 */
const onConnectionRestored = async () => {
  // Sincronizar respuestas pendientes
  try {
    const pendingResponses = await AsyncStorage.getItem(
      "pending_sync_responses"
    );
    if (pendingResponses) {
      console.log("📤 [OfflineManager] Sincronizando respuestas pendientes...");
      // Aquí se implementaría la lógica de sincronización
    }
  } catch (error) {
    console.error("❌ Error en sincronización:", error);
  }
};

// ============================================
// FUNCIONES ONLINE (solo endpoints)
// ============================================

/**
 * ONLINE: Obtener formularios desde endpoint
 */
export const getFormsOnline = async (apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log("🌐 [ONLINE] Obteniendo formularios desde API...");
  const data = await apiFunction();

  // Actualizar caché para uso offline
  await setCacheWithTTL(CACHE_KEYS.FORMS, data, CACHE_TTL.LONG);
  console.log("💾 [ONLINE] Formularios guardados en caché");

  return data;
};

/**
 * ONLINE: Obtener mis formularios desde endpoint
 */
export const getMyFormsOnline = async (apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log("🌐 [ONLINE] Obteniendo mis formularios desde API...");
  const data = await apiFunction();

  // Actualizar caché
  await setCacheWithTTL(CACHE_KEYS.MY_FORMS, data, CACHE_TTL.MEDIUM);
  console.log("💾 [ONLINE] Mis formularios guardados en caché");

  return data;
};

/**
 * ONLINE: Obtener formularios pendientes desde endpoint
 */
export const getPendingFormsOnline = async (apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log("🌐 [ONLINE] Obteniendo formularios pendientes desde API...");
  const data = await apiFunction();

  // Actualizar caché
  await setCacheWithTTL(CACHE_KEYS.PENDING_FORMS, data, CACHE_TTL.MEDIUM);
  console.log("💾 [ONLINE] Formularios pendientes guardados en caché");

  return data;
};

/**
 * ONLINE: Obtener diseño de formulario desde endpoint
 */
export const getFormDesignOnline = async (formId, apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log(
    `🌐 [ONLINE] Obteniendo diseño del formulario ${formId} desde API...`
  );
  const data = await apiFunction(formId);

  // Actualizar caché
  const cacheKey = `${CACHE_KEYS.FORM_DESIGN}${formId}`;
  await setCacheWithTTL(cacheKey, data, CACHE_TTL.LONG);
  console.log(`💾 [ONLINE] Diseño del formulario ${formId} guardado en caché`);

  return data;
};

/**
 * ONLINE: Obtener preguntas de formulario desde endpoint
 */
export const getFormQuestionsOnline = async (formId, apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log(
    `🌐 [ONLINE] Obteniendo preguntas del formulario ${formId} desde API...`
  );
  const data = await apiFunction(formId);

  // Actualizar caché
  const cacheKey = `${CACHE_KEYS.FORM_QUESTIONS}${formId}`;
  await setCacheWithTTL(cacheKey, data, CACHE_TTL.LONG);
  console.log(
    `💾 [ONLINE] Preguntas del formulario ${formId} guardadas en caché`
  );

  return data;
};

/**
 * ONLINE: Obtener correlaciones desde endpoint
 */
export const getCorrelationsOnline = async (questionId, apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log(
    `🌐 [ONLINE] Obteniendo correlaciones de pregunta ${questionId} desde API...`
  );
  const data = await apiFunction(questionId);

  // Actualizar caché
  const cacheKey = `${CACHE_KEYS.CORRELATIONS}${questionId}`;
  await setCacheWithTTL(cacheKey, data, CACHE_TTL.LONG);
  console.log(`💾 [ONLINE] Correlaciones guardadas en caché`);

  return data;
};

/**
 * ONLINE: Obtener instructivos desde endpoint
 */
export const getInstructivosOnline = async (formId, apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log(
    `🌐 [ONLINE] Obteniendo instructivos del formulario ${formId} desde API...`
  );
  const data = await apiFunction(formId);

  // Actualizar caché
  const cacheKey = `${CACHE_KEYS.INSTRUCTIVOS}${formId}`;
  await setCacheWithTTL(cacheKey, data, CACHE_TTL.LONG);
  console.log(`💾 [ONLINE] Instructivos guardados en caché`);

  return data;
};

/**
 * ONLINE: Obtener mensajes de alerta desde endpoint
 */
export const getAlertMessagesOnline = async (formId, apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log(
    `🌐 [ONLINE] Obteniendo mensajes de alerta del formulario ${formId} desde API...`
  );
  const data = await apiFunction(formId);

  // Actualizar caché
  const cacheKey = `${CACHE_KEYS.ALERT_MESSAGES}${formId}`;
  await setCacheWithTTL(cacheKey, data, CACHE_TTL.MEDIUM);
  console.log(`💾 [ONLINE] Mensajes de alerta guardados en caché`);

  return data;
};

/**
 * ONLINE: Obtener operaciones matemáticas desde endpoint
 */
export const getMathOperationsOnline = async (
  formId,
  questionIds,
  apiFunction
) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log(
    `🌐 [ONLINE] Obteniendo operaciones matemáticas del formulario ${formId} desde API...`
  );
  const data = await apiFunction(formId, questionIds);

  // Actualizar caché
  const cacheKey = `${CACHE_KEYS.MATH_OPERATIONS}${formId}`;
  await setCacheWithTTL(cacheKey, data, CACHE_TTL.LONG);
  console.log(`💾 [ONLINE] Operaciones matemáticas guardadas en caché`);

  return data;
};

/**
 * ONLINE: Guardar respuesta en servidor
 */
export const saveResponseOnline = async (formId, responses, apiFunction) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión a internet");
  }

  console.log(
    `🌐 [ONLINE] Guardando respuesta del formulario ${formId} en servidor...`
  );
  const result = await apiFunction(formId, responses);

  console.log("✅ [ONLINE] Respuesta guardada en servidor");
  return result;
};

// ============================================
// FUNCIONES OFFLINE (solo AsyncStorage)
// ============================================

/**
 * OFFLINE: Obtener formularios desde caché
 */
export const getFormsOffline = async () => {
  console.log("📵 [OFFLINE] Obteniendo formularios desde caché...");
  const cached = await getCacheWithTTL(CACHE_KEYS.FORMS);

  if (!cached) {
    console.warn("⚠️ [OFFLINE] No hay formularios en caché");
    return [];
  }

  console.log(
    `✅ [OFFLINE] ${cached.length || 0} formularios obtenidos desde caché`
  );
  return cached;
};

/**
 * OFFLINE: Obtener mis formularios desde caché
 */
export const getMyFormsOffline = async () => {
  console.log("📵 [OFFLINE] Obteniendo mis formularios desde caché...");
  const cached = await getCacheWithTTL(CACHE_KEYS.MY_FORMS);

  if (!cached) {
    console.warn("⚠️ [OFFLINE] No hay mis formularios en caché");
    return [];
  }

  console.log(
    `✅ [OFFLINE] ${cached.length || 0} formularios obtenidos desde caché`
  );
  return cached;
};

/**
 * OFFLINE: Obtener formularios pendientes desde caché
 */
export const getPendingFormsOffline = async () => {
  console.log("📵 [OFFLINE] Obteniendo formularios pendientes desde caché...");
  const cached = await getCacheWithTTL(CACHE_KEYS.PENDING_FORMS);

  if (!cached) {
    console.warn("⚠️ [OFFLINE] No hay formularios pendientes en caché");
    return [];
  }

  console.log(
    `✅ [OFFLINE] ${cached.length || 0} formularios pendientes obtenidos desde caché`
  );
  return cached;
};

/**
 * OFFLINE: Obtener diseño de formulario desde caché
 */
export const getFormDesignOffline = async (formId) => {
  console.log(
    `📵 [OFFLINE] Obteniendo diseño del formulario ${formId} desde caché...`
  );
  const cacheKey = `${CACHE_KEYS.FORM_DESIGN}${formId}`;
  const cached = await getCacheWithTTL(cacheKey);

  if (!cached) {
    throw new Error(`No hay diseño del formulario ${formId} en caché offline`);
  }

  console.log(
    `✅ [OFFLINE] Diseño del formulario ${formId} obtenido desde caché`
  );
  return cached;
};

/**
 * OFFLINE: Obtener preguntas de formulario desde caché
 */
export const getFormQuestionsOffline = async (formId) => {
  console.log(
    `📵 [OFFLINE] Obteniendo preguntas del formulario ${formId} desde caché...`
  );
  const cacheKey = `${CACHE_KEYS.FORM_QUESTIONS}${formId}`;
  const cached = await getCacheWithTTL(cacheKey);

  if (!cached) {
    throw new Error(
      `No hay preguntas del formulario ${formId} en caché offline`
    );
  }

  console.log(
    `✅ [OFFLINE] ${cached.length || 0} preguntas obtenidas desde caché`
  );
  return cached;
};

/**
 * OFFLINE: Obtener correlaciones desde caché
 */
export const getCorrelationsOffline = async (questionId) => {
  console.log(
    `📵 [OFFLINE] Obteniendo correlaciones de pregunta ${questionId} desde caché...`
  );
  const cacheKey = `${CACHE_KEYS.CORRELATIONS}${questionId}`;
  const cached = await getCacheWithTTL(cacheKey);

  if (!cached) {
    console.warn(
      `⚠️ [OFFLINE] No hay correlaciones para pregunta ${questionId} en caché`
    );
    return null;
  }

  console.log(`✅ [OFFLINE] Correlaciones obtenidas desde caché`);
  return cached;
};

/**
 * OFFLINE: Obtener instructivos desde caché
 */
export const getInstructivosOffline = async (formId) => {
  console.log(
    `📵 [OFFLINE] Obteniendo instructivos del formulario ${formId} desde caché...`
  );
  const cacheKey = `${CACHE_KEYS.INSTRUCTIVOS}${formId}`;
  const cached = await getCacheWithTTL(cacheKey);

  if (!cached) {
    console.warn(
      `⚠️ [OFFLINE] No hay instructivos para formulario ${formId} en caché`
    );
    return { found: false, files: [] };
  }

  console.log(`✅ [OFFLINE] Instructivos obtenidos desde caché`);
  return cached;
};

/**
 * OFFLINE: Obtener mensajes de alerta desde caché
 */
export const getAlertMessagesOffline = async (formId) => {
  console.log(
    `📵 [OFFLINE] Obteniendo mensajes de alerta del formulario ${formId} desde caché...`
  );
  const cacheKey = `${CACHE_KEYS.ALERT_MESSAGES}${formId}`;
  const cached = await getCacheWithTTL(cacheKey);

  if (!cached) {
    console.warn(
      `⚠️ [OFFLINE] No hay mensajes de alerta para formulario ${formId} en caché`
    );
    return { found: false, message: null };
  }

  console.log(`✅ [OFFLINE] Mensajes de alerta obtenidos desde caché`);
  return cached;
};

/**
 * OFFLINE: Obtener operaciones matemáticas desde caché
 */
export const getMathOperationsOffline = async (formId) => {
  console.log(
    `📵 [OFFLINE] Obteniendo operaciones matemáticas del formulario ${formId} desde caché...`
  );
  const cacheKey = `${CACHE_KEYS.MATH_OPERATIONS}${formId}`;
  const cached = await getCacheWithTTL(cacheKey);

  if (!cached) {
    console.warn(
      `⚠️ [OFFLINE] No hay operaciones matemáticas para formulario ${formId} en caché`
    );
    return { found: false, operations: [] };
  }

  console.log(`✅ [OFFLINE] Operaciones matemáticas obtenidas desde caché`);
  return cached;
};

/**
 * OFFLINE: Guardar respuesta localmente para sincronizar después
 */
export const saveResponseOffline = async (formId, responses) => {
  console.log(
    `📵 [OFFLINE] Guardando respuesta del formulario ${formId} localmente...`
  );

  try {
    // Obtener respuestas pendientes
    const pendingStr = await AsyncStorage.getItem("pending_sync_responses");
    const pending = pendingStr ? JSON.parse(pendingStr) : [];

    // Agregar nueva respuesta
    pending.push({
      formId,
      responses,
      timestamp: Date.now(),
      synced: false,
    });

    // Guardar
    await AsyncStorage.setItem(
      "pending_sync_responses",
      JSON.stringify(pending)
    );
    console.log(
      "✅ [OFFLINE] Respuesta guardada localmente para sincronización posterior"
    );

    return { success: true, offline: true, pendingSync: true };
  } catch (error) {
    console.error("❌ [OFFLINE] Error guardando respuesta localmente:", error);
    throw error;
  }
};

// ============================================
// FUNCIONES AUTOMÁTICAS (detectan conexión)
// ============================================

/**
 * AUTO: Obtener formularios (detecta online/offline)
 */
export const getForms = async (apiFunction) => {
  const online = await isOnline();

  if (online) {
    try {
      return await getFormsOnline(apiFunction);
    } catch (error) {
      console.warn("⚠️ Error en modo online, intentando caché...", error);
      return await getFormsOffline();
    }
  } else {
    return await getFormsOffline();
  }
};

/**
 * AUTO: Obtener mis formularios (detecta online/offline)
 */
export const getMyForms = async (apiFunction) => {
  const online = await isOnline();

  if (online) {
    try {
      return await getMyFormsOnline(apiFunction);
    } catch (error) {
      console.warn("⚠️ Error en modo online, intentando caché...", error);
      return await getMyFormsOffline();
    }
  } else {
    return await getMyFormsOffline();
  }
};

/**
 * AUTO: Obtener formularios pendientes (detecta online/offline)
 */
export const getPendingForms = async (apiFunction) => {
  const online = await isOnline();

  if (online) {
    try {
      return await getPendingFormsOnline(apiFunction);
    } catch (error) {
      console.warn("⚠️ Error en modo online, intentando caché...", error);
      return await getPendingFormsOffline();
    }
  } else {
    return await getPendingFormsOffline();
  }
};

/**
 * AUTO: Obtener diseño de formulario (detecta online/offline)
 */
export const getFormDesign = async (formId, apiFunction) => {
  const online = await isOnline();

  if (online) {
    try {
      return await getFormDesignOnline(formId, apiFunction);
    } catch (error) {
      console.warn("⚠️ Error en modo online, intentando caché...", error);
      return await getFormDesignOffline(formId);
    }
  } else {
    return await getFormDesignOffline(formId);
  }
};

/**
 * AUTO: Obtener preguntas de formulario (detecta online/offline)
 */
export const getFormQuestions = async (formId, apiFunction) => {
  const online = await isOnline();

  if (online) {
    try {
      return await getFormQuestionsOnline(formId, apiFunction);
    } catch (error) {
      console.warn("⚠️ Error en modo online, intentando caché...", error);
      return await getFormQuestionsOffline(formId);
    }
  } else {
    return await getFormQuestionsOffline(formId);
  }
};

/**
 * AUTO: Guardar respuesta (detecta online/offline)
 */
export const saveResponse = async (formId, responses, apiFunction) => {
  const online = await isOnline();

  if (online) {
    return await saveResponseOnline(formId, responses, apiFunction);
  } else {
    return await saveResponseOffline(formId, responses);
  }
};

// ============================================
// SINCRONIZACIÓN
// ============================================

/**
 * Sincronizar respuestas pendientes cuando hay conexión
 */
export const syncPendingResponses = async (apiFunction) => {
  if (!(await isOnline())) {
    console.warn("⚠️ No hay conexión, no se puede sincronizar");
    return { synced: 0, failed: 0 };
  }

  console.log("🔄 Iniciando sincronización de respuestas pendientes...");

  try {
    const pendingStr = await AsyncStorage.getItem("pending_sync_responses");
    if (!pendingStr) {
      console.log("✅ No hay respuestas pendientes para sincronizar");
      return { synced: 0, failed: 0 };
    }

    const pending = JSON.parse(pendingStr);
    const toSync = pending.filter((item) => !item.synced);

    if (toSync.length === 0) {
      console.log("✅ No hay respuestas pendientes para sincronizar");
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (const item of toSync) {
      try {
        await apiFunction(item.formId, item.responses);
        item.synced = true;
        synced++;
        console.log(`✅ Respuesta ${item.formId} sincronizada`);
      } catch (error) {
        console.error(`❌ Error sincronizando ${item.formId}:`, error);
        failed++;
      }
    }

    // Guardar estado actualizado
    await AsyncStorage.setItem(
      "pending_sync_responses",
      JSON.stringify(pending)
    );

    console.log(
      `🔄 Sincronización completada: ${synced} exitosas, ${failed} fallidas`
    );
    return { synced, failed };
  } catch (error) {
    console.error("❌ Error en sincronización:", error);
    return { synced: 0, failed: 0, error };
  }
};

/**
 * Limpiar respuestas sincronizadas
 */
export const clearSyncedResponses = async () => {
  try {
    const pendingStr = await AsyncStorage.getItem("pending_sync_responses");
    if (!pendingStr) return;

    const pending = JSON.parse(pendingStr);
    const stillPending = pending.filter((item) => !item.synced);

    await AsyncStorage.setItem(
      "pending_sync_responses",
      JSON.stringify(stillPending)
    );
    console.log(
      `🗑️ Respuestas sincronizadas limpiadas. Quedan ${stillPending.length} pendientes`
    );
  } catch (error) {
    console.error("❌ Error limpiando respuestas sincronizadas:", error);
  }
};

// ============================================
// UTILIDADES
// ============================================

/**
 * Obtener estado de sincronización
 */
export const getSyncStatus = async () => {
  try {
    const pendingStr = await AsyncStorage.getItem("pending_sync_responses");
    if (!pendingStr) {
      return { total: 0, pending: 0, synced: 0 };
    }

    const pending = JSON.parse(pendingStr);
    const totalCount = pending.length;
    const syncedCount = pending.filter((item) => item.synced).length;
    const pendingCount = totalCount - syncedCount;

    return {
      total: totalCount,
      pending: pendingCount,
      synced: syncedCount,
    };
  } catch (error) {
    console.error("❌ Error obteniendo estado de sincronización:", error);
    return { total: 0, pending: 0, synced: 0 };
  }
};

/**
 * Forzar actualización de caché desde API (cuando esté online)
 */
export const forceRefreshCache = async (apiFunction, cacheKey) => {
  if (!(await isOnline())) {
    throw new Error("No hay conexión para refrescar caché");
  }

  console.log(`🔄 Forzando actualización de caché: ${cacheKey}`);
  const data = await apiFunction();
  await setCacheWithTTL(cacheKey, data, CACHE_TTL.LONG);
  console.log(`✅ Caché actualizado: ${cacheKey}`);

  return data;
};
