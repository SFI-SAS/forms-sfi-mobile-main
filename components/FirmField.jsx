import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import useNetInfo from "../hooks/useNetInfo";
import { getBackendUrl, getAuthToken } from "../services/auth";

const OFFLINE_SIGNATURES_KEY = "offline_signatures_cache";
const REGISTERED_USERS_KEY = "registered_facial_users_cache";

const FirmField = ({
  label = "Firma Digital",
  options = [],
  required = false,
  onChange,
  value,
  disabled = false,
  error = false,
  documentHash = "",
  onFirmSuccess,
  onFirmError,
  onValueChange,
  apiUrl = "https://api-facialsafe.service.saferut.com",
  autoCloseDelay = 10000,
}) => {
  const isOnline = useNetInfo();
  const webViewRef = useRef(null);

  // Estados
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [firmData, setFirmData] = useState(null);
  const [firmCompleted, setFirmCompleted] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(value || "");
  const [firmError, setFirmError] = useState(null); // 🆕 Estado de error
  // Estados de autenticación (según versión web)
  const [authStatus, setAuthStatus] = useState(""); // 'idle' | 'loading' | 'success' | 'error' | 'network-error' | 'validation-failed' | 'timeout'
  const [authMessage, setAuthMessage] = useState("");
  const [processStatus, setProcessStatus] = useState("");
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [webViewHtml, setWebViewHtml] = useState(null);
  const [showUserPickerModal, setShowUserPickerModal] = useState(false); // Modal para seleccionar usuario
  const [selectedUser, setSelectedUser] = useState(null); // ✅ Estado del usuario seleccionado completo

  // Listener para deep links (retorno desde navegador externo)
  useEffect(() => {
    const handleDeepLink = ({ url }) => {
      console.log("🔗 Deep link recibido:", url);

      if (url && url.includes("formssfi://firma-callback")) {
        try {
          const urlObj = new URL(url);
          const success = urlObj.searchParams.get("success");
          const data = urlObj.searchParams.get("data");
          const error = urlObj.searchParams.get("error");

          console.log("📦 Parámetros:", {
            success,
            hasData: !!data,
            hasError: !!error,
          });

          if (success === "true" && data) {
            const signatureData = JSON.parse(decodeURIComponent(data));
            console.log("✅ Firma desde navegador:", {
              person_id: signatureData.person_id,
              hasQR: !!signatureData.qr_code || !!signatureData.qr_link,
            });
            handleSignSuccess(signatureData);
          } else if (error) {
            handleSignError(decodeURIComponent(error));
          }
        } catch (e) {
          console.error("❌ Error procesando deep link:", e);
          Alert.alert(
            "Error",
            "No se pudo procesar la respuesta: " + e.message
          );
        }
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription.remove();
  }, []);

  // Cargar usuarios registrados
  useEffect(() => {
    loadRegisteredUsers();
  }, []);

  // ✅ Sincronizar selectedUser cuando cambie selectedUserId o la lista de usuarios
  useEffect(() => {
    if (selectedUserId) {
      const allUsers = [...options, ...registeredUsers];
      const user = allUsers.find((opt) => opt?.id === selectedUserId);
      if (user) {
        setSelectedUser(user);
        console.log("👤 [FirmField] Usuario sincronizado:", user.name, user.id);
      }
    }
  }, [selectedUserId, options, registeredUsers]);

  const loadRegisteredUsers = async () => {
    setLoadingUsers(true);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 [FirmField] Iniciando carga de usuarios faciales");

    // Verificar conexión real con NetInfo
    try {
      const netState = await NetInfo.fetch();
      const realConnection =
        netState.isConnected && netState.isInternetReachable !== false;
      console.log(
        `📡 [FirmField] Estado de conexión (hook): ${isOnline ? "ONLINE" : "OFFLINE"}`
      );
      console.log(
        `📡 [FirmField] Estado real (NetInfo): ${realConnection ? "ONLINE ✅" : "OFFLINE ❌"}`
      );
      console.log(
        `📡 [FirmField] Detalles: isConnected=${netState.isConnected}, isInternetReachable=${netState.isInternetReachable}, type=${netState.type}`
      );
    } catch (e) {
      console.warn(
        "⚠️ [FirmField] No se pudo verificar estado de conexión:",
        e.message
      );
    }

    try {
      // 🆕 SIEMPRE intentar consultar el endpoint PRIMERO (sin depender de isOnline)
      console.log(
        "🌐 [FirmField] Intentando consultar endpoint /responses/answers/regisfacial..."
      );

      const backendUrl = await getBackendUrl();
      const token = await getAuthToken();

      console.log(`🔗 [FirmField] Backend URL: ${backendUrl}`);
      console.log(`🔑 [FirmField] Token presente: ${token ? "Sí" : "No"}`);

      const response = await fetch(
        `${backendUrl}/responses/answers/regisfacial`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        `📊 [FirmField] Respuesta del endpoint: ${response.status} ${response.statusText}`
      );

      if (response.ok) {
        const rawData = await response.json();
        console.log(
          `📦 [FirmField] Datos crudos recibidos:`,
          JSON.stringify(rawData, null, 2)
        );

        // Adaptar estructura de datos del endpoint
        let users = [];

        // Los datos vienen en formato: { answer_text: "{...faceData...}", encrypted_hash: "..." }
        if (Array.isArray(rawData)) {
          console.log(
            `🔍 [FirmField] Estructura del primer usuario:`,
            Object.keys(rawData[0] || {})
          );

          users = rawData
            .map((user, index) => {
              try {
                // El answer_text es un JSON stringificado con faceData
                const answerData = JSON.parse(user.answer_text || "{}");
                const faceData = answerData.faceData || {};

                if (index === 0) {
                  console.log(
                    `🔍 [FirmField] FaceData parseado del primer usuario:`,
                    faceData
                  );
                }

                // Validaciones básicas
                if (!faceData.person_id) {
                  console.warn(`⚠️ [FirmField] Usuario ${index} sin person_id`);
                  return null;
                }

                const confidence = faceData.confidence_score || 0;
                const hasFaceImages =
                  Array.isArray(faceData.face_images) &&
                  faceData.face_images.length > 0;
                const faceImagesCount = hasFaceImages
                  ? faceData.face_images.length
                  : 0;

                console.log(
                  `📋 [FirmField] Usuario: ${faceData.personName} (${faceData.person_id}) - Face images: ${faceImagesCount} - Success: ${faceData.success}`
                );

                return {
                  id: faceData.person_id,
                  name:
                    faceData.personName || faceData.person_name || "Sin nombre",
                  num_document: faceData.person_id,
                  // Datos adicionales
                  email: faceData.person_email || "",
                  confidence_score: confidence,
                  encrypted_hash: user.encrypted_hash || "",
                  face_images_count: faceImagesCount,
                  has_face_images: hasFaceImages,
                };
              } catch (e) {
                console.error(
                  `❌ [FirmField] Error parseando usuario ${index}:`,
                  e.message
                );
                return null;
              }
            })
            .filter((user) => user !== null); // Filtrar solo usuarios con error de parsing
        }

        console.log(
          `✅ [FirmField] ${users.length} usuarios REGISTRADOS procesados desde API (de ${rawData.length} totales)`
        );
        console.log(
          `👥 [FirmField] Usuarios disponibles:`,
          users.map(
            (u) =>
              `${u.name} (${u.num_document}) [${u.face_images_count} imágenes, ${u.has_face_images ? "REGISTRADO" : "INTENTO DE REGISTRO"}]`
          )
        );

        setRegisteredUsers(users);

        // Guardar en caché para uso offline
        await AsyncStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
        console.log(`💾 [FirmField] Usuarios guardados en caché`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        return; // Salir, ya tenemos los datos frescos
      } else {
        console.warn(
          `⚠️ [FirmField] Error en respuesta del endpoint: ${response.status}`
        );
        const errorText = await response.text();
        console.warn(`⚠️ [FirmField] Detalle del error: ${errorText}`);
      }
    } catch (error) {
      console.error(
        "❌ [FirmField] Error al consultar endpoint:",
        error.message
      );
      console.error("❌ [FirmField] Stack:", error.stack);
    }

    // 📦 FALLBACK: Usar caché solo si falló el endpoint
    try {
      console.log("📦 [FirmField] Intentando cargar desde caché...");
      const cached = await AsyncStorage.getItem(REGISTERED_USERS_KEY);

      if (cached) {
        const users = JSON.parse(cached);
        console.log(
          `📋 [FirmField] ${users.length} usuarios cargados desde caché`
        );
        console.log(
          `👥 [FirmField] Usuarios (caché):`,
          users.map((u) => `${u.name} (${u.num_document})`)
        );
        setRegisteredUsers(users);
      } else {
        console.log("⚠️ [FirmField] No hay usuarios en caché");
        setRegisteredUsers([]);
      }
    } catch (cacheError) {
      console.error("❌ [FirmField] Error cargando caché:", cacheError);
      setRegisteredUsers([]);
    } finally {
      setLoadingUsers(false);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
  };

  // Manejar mensajes del WebView
  const handleWebViewMessage = (event) => {
    try {
      const data = event.nativeEvent.data;
      console.log("📨 Mensaje del WebView:", data);

      // Intentar parsear como JSON primero (para actualizaciones de estado)
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.type === "log") {
          // Log desde WebView
          console.log("🌐 [WebView]:", jsonData.message);
          return;
        }
        if (jsonData.type === "status") {
          // Actualizar estado del proceso
          console.log("📊 Actualización de estado:", jsonData.message);
          setProcessStatus(jsonData.message);
          if (jsonData.status) {
            setAuthStatus(jsonData.status);
          }
          return;
        }
      } catch (e) {
        // No es JSON, continuar con el proceso normal
      }

      if (data.startsWith("formssfi://firma-callback")) {
        const url = new URL(data);
        const success = url.searchParams.get("success");
        const dataParam = url.searchParams.get("data");
        const errorParam = url.searchParams.get("error");

        if (success === "true" && dataParam) {
          const signatureData = JSON.parse(decodeURIComponent(dataParam));
          handleSignSuccess(signatureData);
        } else if (errorParam) {
          handleSignError(decodeURIComponent(errorParam));
        }
      }
    } catch (error) {
      console.error("❌ Error procesando mensaje:", error);
    }
  };

  // Manejar éxito de firma (según versión web)
  const handleSignSuccess = async (data) => {
    try {
      console.log("✅ Firma exitosa recibida:", data);

      // Extraer firmData si viene en ese formato
      const firmDataObj = data.firmData || data;

      // Estructura en formato esperado: { firmData: { success, person_id, person_name, qr_url } }
      const firmResult = {
        firmData: {
          success: true, // 🆕 Siempre true en caso de éxito
          person_id:
            firmDataObj.person_id ||
            selectedUser?.num_document ||
            selectedUser?.id ||
            "",
          person_name: firmDataObj.person_name || selectedUser?.name || "",
          qr_url:
            firmDataObj.qr_url ||
            firmDataObj.qrUrl ||
            firmDataObj.qr_link ||
            firmDataObj.qrLink ||
            "",
        },
      };

      // Datos adicionales para caché interno
      const fullData = {
        ...firmResult.firmData,
        document_id: data.document_id || documentHash || "",
        signature_image: data.signature_image || "",
        face_image: data.face_image || "",
        confidence_score: data.confidence_score || 0,
        liveness_score: data.liveness_score || 0,
        qr_code: data.qr_code || data.qrCode || "",
        validation_result: data.validation_result || "validated",
        validation_id: data.validation_id || "",
        timestamp: data.timestamp || new Date().toISOString(),
        captureMethod: data.captureMethod || "sfi-facial",
      };

      console.log("📦 Formato guardado:", JSON.stringify(firmResult));

      // 🆕 Actualizar estados según versión web
      setFirmData(firmResult);
      setFirmCompleted(true);
      setFirmError(null); // Limpiar error
      setAuthStatus("success");
      setAuthMessage("Autenticación y firma completadas exitosamente");
      setProcessStatus("🎉 Firma completada exitosamente");
      setShowModal(false);
      setIsLoading(false);

      // ✅ Guardar en caché SOLO si el usuario vino del modo offline O como respaldo
      // NO guardar offline cuando la firma se hizo online (ya está en servidor)
      if (data.wasOffline) {
        console.log(
          "💾 Firma proveniente de modo offline, guardando en caché..."
        );
        try {
          const existing = await AsyncStorage.getItem(OFFLINE_SIGNATURES_KEY);
          let signatures = existing ? JSON.parse(existing) : [];

          const personId = firmResult.firmData.person_id;
          signatures = signatures.filter((sig) => sig.person_id !== personId);

          const signatureToSave = {
            ...fullData,
            signature_image: fullData.signature_image
              ? fullData.signature_image.substring(0, 30000)
              : "",
            face_image: fullData.face_image
              ? fullData.face_image.substring(0, 30000)
              : "",
            qr_code: fullData.qr_code
              ? fullData.qr_code.substring(0, 10000)
              : "",
            savedAt: new Date().toISOString(),
            isCompressed: true,
          };

          signatures.push(signatureToSave);
          await AsyncStorage.setItem(
            OFFLINE_SIGNATURES_KEY,
            JSON.stringify(signatures)
          );
          console.log(
            `💾 Firma offline guardada en caché para: ${firmResult.firmData.person_name}`
          );
        } catch (err) {
          console.error("❌ Error guardando offline:", err);
        }
      } else {
        console.log(
          "✅ Firma realizada ONLINE, no se guarda en AsyncStorage (ya está en servidor)"
        );
      }

      if (firmResult.firmData.qr_url) {
        Alert.alert(
          "✅ Validación Completa",
          `Firma validada con éxito.\n\n` +
            `Usuario: ${firmResult.firmData.person_name}\n` +
            `Documento: ${firmResult.firmData.person_id}\n\n` +
            `✅ QR URL generado`
        );
      }

      // Enviar en formato esperado al formulario
      const firmResultString = JSON.stringify(firmResult);
      console.log("📤 [FirmField] Enviando firma al formulario:");
      console.log("   - Formato:", JSON.stringify(firmResult, null, 2));
      console.log("   - Campos firmData:", Object.keys(firmResult.firmData));
      console.log("   - person_id:", firmResult.firmData.person_id);
      console.log("   - person_name:", firmResult.firmData.person_name);
      console.log("   - success:", firmResult.firmData.success);
      console.log(
        "   - qr_url:",
        firmResult.firmData.qr_url ? "✅ Presente" : "❌ Ausente"
      );
      console.log("   - Como STRING para formulario:", firmResultString);

      // ✅ Usar onChange (callback principal del FormRenderer)
      if (onChange) onChange(firmResultString);
      if (onValueChange) onValueChange(firmResultString);
      if (onFirmSuccess) onFirmSuccess(firmResult);
    } catch (error) {
      console.error("❌ Error en handleSignSuccess:", error);
    }
  };

  // Manejar error de firma (según versión web - mensajes genéricos)
  const handleSignError = (errorMsg) => {
    console.error("❌ Error en firma:", errorMsg);

    // 🆕 Mensaje genérico según versión web
    let userMessage = "Usuario no encontrado o problemas con la autenticación";

    // Mensaje más específico si el usuario intentó registrarse pero no completó el proceso
    const userInfo =
      selectedUser?.has_face_images === false
        ? `\n\nEl usuario ${selectedUser?.name} (${selectedUser?.num_document}) debe completar primero su registro facial en el sistema antes de poder firmar.`
        : "";

    setAuthStatus("error");
    setAuthMessage(userMessage + userInfo);
    setProcessStatus("💥 Error: Usuario no registrado en sistema facial");
    setShowModal(false);
    setIsLoading(false);

    Alert.alert("❌ Error en la Firma", userMessage + userInfo, [
      { text: "Entendido", style: "cancel" },
    ]);

    if (onFirmError) onFirmError(new Error(userMessage));
  };

  // Abrir modal de firma (con reseteo de estados según versión web)
  const handleOpenFirm = async () => {
    if (!selectedUserId) {
      Alert.alert(
        "Selecciona un usuario",
        "Debes seleccionar quién va a firmar"
      );
      return;
    }

    if (!selectedUser) {
      Alert.alert("Error", "Usuario no encontrado");
      return;
    }

    // 🆕 RESETEAR estados al iniciar (según versión web)
    setFirmData(null);
    setFirmError(null);
    setAuthStatus("idle");
    setAuthMessage("");
    setProcessStatus("Iniciando proceso de firma...");

    // ✅ Verificar conexión REAL antes de decidir modo offline
    let realConnectionState = isOnline;
    try {
      const netState = await NetInfo.fetch();
      realConnectionState =
        netState.isConnected && netState.isInternetReachable !== false;
      console.log(`📡 [FirmField] Verificación de conexión para firma:`);
      console.log(`   - Hook isOnline: ${isOnline}`);
      console.log(`   - NetInfo real: ${realConnectionState}`);
      console.log(
        `   - Detalles: isConnected=${netState.isConnected}, isInternetReachable=${netState.isInternetReachable}`
      );
    } catch (e) {
      console.warn(
        "⚠️ [FirmField] Error verificando conexión, usando hook:",
        e.message
      );
    }

    // ⚠️ Modo OFFLINE - Solo usar AsyncStorage si NO hay conexión
    if (!realConnectionState) {
      console.log("📡 [FirmField] SIN CONEXIÓN - Modo offline activado");

      try {
        const cached = await AsyncStorage.getItem(OFFLINE_SIGNATURES_KEY);
        if (cached) {
          const signatures = JSON.parse(cached);
          const userId = selectedUser.num_document || selectedUser.id;
          const userSignatures = signatures.filter(
            (sig) => sig.person_id === userId
          );

          if (userSignatures.length > 0) {
            const lastSignature = userSignatures.sort(
              (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
            )[0];

            const qrInfo = lastSignature.qr_link
              ? "\n✅ QR Link: Disponible"
              : lastSignature.qr_code
                ? "\n✅ QR Code: Generado"
                : "";

            Alert.alert(
              "📡 Modo Offline",
              `Se usará la última firma de ${selectedUser.name}.\n\n` +
                `📅 Fecha: ${new Date(lastSignature.timestamp).toLocaleString()}\n` +
                `🎯 Confianza: ${(lastSignature.confidence_score * 100).toFixed(1)}%` +
                qrInfo +
                `\n\n⚠️ Imágenes comprimidas`,
              [
                {
                  text: "Usar Firma",
                  onPress: () =>
                    handleSignSuccess({ ...lastSignature, wasOffline: true }),
                },
                { text: "Cancelar", style: "cancel" },
              ]
            );
            return;
          }
        }

        Alert.alert(
          "❌ Sin Firma Offline",
          `No hay firma guardada para ${selectedUser.name}.\n\nNecesitas conexión a internet.`
        );
        return;
      } catch (error) {
        console.error("❌ Error cargando firma offline:", error);
        return;
      }
    }

    // ✅ Modo ONLINE - Cargar componente directo con API real (como versión web)
    console.log("🌐 [FirmField] CON CONEXIÓN - Modo online activado");
    console.log("🖊️ [FirmField] Iniciando proceso de firma con API:", {
      personId: selectedUser.id, // Usar ID exactamente como en la web
      personName: selectedUser.name,
      documentHash,
      apiUrl,
    });

    loadFirmComponent();
  };

  // Cargar componente SFI Facial (como versión web)
  const loadFirmComponent = async () => {
    try {
      // 🎯 Usar exactamente los mismos campos que la versión web
      const personId = selectedUser.id || ""; // IMPORTANTE: usar .id no .num_document
      const personName = selectedUser.name || "Usuario";
      const docId = documentHash || "documento-" + Date.now();

      console.log(
        "📤 [FirmField] Datos que se enviarán al componente sfi-facial:",
        {
          personId,
          personName,
          docId,
          apiUrl,
        }
      );

      // 🆕 Actualizar estado de carga
      setIsLoading(true);
      setAuthStatus("loading");
      setAuthMessage("Iniciando proceso de autenticación...");
      setShowModal(true);

      // HTML que carga y configura el componente SFI Facial

      const htmlPage = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Firma Digital</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
      font-family: -apple-system, sans-serif;
      padding: 10px;
      min-height: 100vh;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h2 { color: #667eea; margin-bottom: 15px; text-align: center; }
    .info { background: #f0f4ff; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 14px; }
    .info strong { color: #667eea; }
    sfi-facial { display: block; width: 100%; min-height: 450px; }
    .loading { text-align: center; padding: 20px; color: #666; }
    .debug { background: #fef3cd; padding: 10px; margin-top: 10px; border-radius: 6px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🔐 Firma Digital Biométrica</h2>
    <div class="info">
      <strong>Usuario:</strong> ${personName}<br>
      <strong>Documento:</strong> ${personId}<br>
      <strong>ID:</strong> ${docId}
    </div>
    <div id="loading" class="loading">⏳ Cargando componente...</div>
    <sfi-facial id="facial" mode="sign" api-url="${apiUrl}" 
      person-id="${personId}" person-name="${personName}" document-hash="${docId}">
    </sfi-facial>
    <div id="debug" class="debug"></div>
  </div>
  
  <script>
    // Mostrar que el HTML cargó
    document.getElementById('debug').innerHTML = '📄 HTML cargado<br>';
    console.log('📄 HTML cargado');
  </script>
  
  <script src="https://cdn.jsdelivr.net/npm/eventemitter3@5.0.1/index.min.js" 
          onload="console.log('✅ EventEmitter cargado'); document.getElementById('debug').innerHTML += '✅ EventEmitter cargado<br>';"
          onerror="console.log('❌ Error EventEmitter'); document.getElementById('debug').innerHTML += '❌ Error EventEmitter<br>';"></script>
  <script src="https://reconocimiento-facial-safe.service.saferut.com/index.js"
          onload="console.log('✅ SFI Facial cargado'); document.getElementById('debug').innerHTML += '✅ SFI Facial cargado<br>';"
          onerror="console.log('❌ Error SFI Facial'); document.getElementById('debug').innerHTML += '❌ Error SFI Facial<br>';"></script>
  
  <script>
    function log(msg) {
      const debug = document.getElementById('debug');
      if (debug) {
        debug.style.display = 'block';
        debug.innerHTML += new Date().toLocaleTimeString() + ': ' + msg + '<br>';
      }
      console.log(msg);
      
      // Enviar logs a React Native también
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
        }
      } catch(e) {}
    }
    
    // Log inicial
    log('🚀 Iniciando scripts...');
    
    if (typeof EventEmitter === 'undefined') {
      log('❌ EventEmitter no cargado');
    } else {
      log('✅ EventEmitter OK');
    }
    
    setTimeout(() => {
      const facial = document.getElementById('facial');
      const loading = document.getElementById('loading');
      
      if (!facial) {
        log('❌ Componente no encontrado');
        return;
      }
      
      log('✅ Componente listo');
      loading.style.display = 'none';
      
      // 🆕 Eventos adicionales de validación (según versión web)
      facial.addEventListener('sign-start', (e) => {
        log('🚀 Iniciando autenticación biométrica...');
        // Enviar actualización de estado al WebView
        const update = JSON.stringify({ type: 'status', status: 'loading', message: 'Iniciando autenticación biométrica...' });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(update);
        }
      });
      
      facial.addEventListener('liveness-start', (e) => {
        log('👤 Iniciando verificación de vida...');
        const update = JSON.stringify({ type: 'status', status: 'loading', message: 'Verificando que eres una persona real...' });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(update);
        }
      });
      
      facial.addEventListener('liveness-progress', (e) => {
        const data = e.detail;
        log('👤 Progreso: ' + data.instruction);
        const update = JSON.stringify({ type: 'status', status: 'loading', message: data.instruction });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(update);
        }
      });
      
      facial.addEventListener('sign-validation-start', (e) => {
        log('🔍 Validando identidad...');
        const update = JSON.stringify({ type: 'status', status: 'loading', message: 'Validando identidad...' });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(update);
        }
      });
      
      facial.addEventListener('liveness-complete', (e) => {
        log('✅ Verificación de vida completada');
        const update = JSON.stringify({ type: 'status', status: 'loading', message: 'Verificación de vida completada' });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(update);
        }
      });
      
      facial.addEventListener('sign-validation-result', (e) => {
        const data = e.detail;
        log('🔍 sign-validation-result completo: ' + JSON.stringify(data, null, 2));
        
        if (data.success) {
          log('✅ Autenticación exitosa: ' + Math.round(data.confidence * 100) + '% confianza');
          log('✅ Person ID validado: ' + data.person_id);
          const update = JSON.stringify({ type: 'status', status: 'success', message: 'Autenticación exitosa: ' + Math.round(data.confidence * 100) + '% confianza' });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(update);
          }
        } else {
          log('❌ Autenticación fallida: ' + data.message);
          log('❌ Detalles del fallo: ' + JSON.stringify(data));
          log('❌ Person ID enviado: ${personId}');
          const update = JSON.stringify({ type: 'status', status: 'error', message: 'Usuario no encontrado o problemas con la autenticación' });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(update);
          }
        }
      });
      
      facial.addEventListener('sign-request-start', (e) => {
        log('📤 Generando firma digital...');
        const update = JSON.stringify({ type: 'status', status: 'loading', message: 'Generando firma digital...' });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(update);
        }
      });
      
      facial.addEventListener('sign-request-progress', (e) => {
        const data = e.detail;
        const msg = data.status === 'uploading' ? 'Enviando datos...' : 'Procesando firma...';
        log('📊 ' + msg);
        const update = JSON.stringify({ type: 'status', status: 'loading', message: msg });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(update);
        }
      });
      
      facial.addEventListener('sign-success', (e) => {
        log('✅ sign-success - Firma completada exitosamente');
        const eventData = e.detail || {};
        
        log('🔍 EventData completo recibido: ' + JSON.stringify(eventData, null, 2));
        
        // 🎯 Formato según versión web: { firmData: { success, person_id, person_name, qr_url } }
        const firmData = {
          success: true,
          person_id: eventData.person_id || '${personId}',
          person_name: eventData.person_name || '${personName}',
          qr_url: eventData.qr_url || eventData.qrUrl || eventData.qr_link || eventData.qrLink || '',
        };
        
        // Datos completos internos (para caché)
        const fullData = {
          firmData: firmData,
          // Datos adicionales para uso interno
          document_id: eventData.document_id || '${docId}',
          signature_image: eventData.signature_image || '',
          face_image: eventData.face_image || '',
          confidence_score: eventData.confidence_score || 0,
          liveness_score: eventData.liveness_score || 0,
          qr_code: eventData.qr_code || eventData.qrCode || '',
          validation_result: eventData.validation_result || 'validated',
          validation_id: eventData.validation_id || '',
          timestamp: new Date().toISOString(),
          captureMethod: 'sfi-facial-web',
          ...eventData
        };
        
        log('📦 FirmData formateado: ' + JSON.stringify(firmData));
        log('📦 FullData completo: ' + JSON.stringify(fullData));
        
        const data = encodeURIComponent(JSON.stringify(fullData));
        const deepLink = 'formssfi://firma-callback?success=true&data=' + data;
        
        if (window.ReactNativeWebView) {
          log('📱 Enviando a WebView');
          window.ReactNativeWebView.postMessage(deepLink);
        } else {
          log('🌐 Redirigiendo');
          window.location.href = deepLink;
        }
      });
      
      // 🆕 Eventos de error específicos (según versión web)
      facial.addEventListener('sign-timeout-error', (e) => {
        log('⏱️ Tiempo de espera agotado');
        const error = encodeURIComponent('Usuario no encontrado o problemas con la autenticación');
        const deepLink = 'formssfi://firma-callback?success=false&error=' + error;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(deepLink);
        } else {
          window.location.href = deepLink;
        }
      });
      
      facial.addEventListener('sign-network-error', (e) => {
        log('🌐 Error de red');
        const error = encodeURIComponent('Usuario no encontrado o problemas con la autenticación');
        const deepLink = 'formssfi://firma-callback?success=false&error=' + error;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(deepLink);
        } else {
          window.location.href = deepLink;
        }
      });
      
      facial.addEventListener('sign-validation-failed', (e) => {
        log('🚫 Validación insuficiente');
        const error = encodeURIComponent('Usuario no encontrado o problemas con la autenticación');
        const deepLink = 'formssfi://firma-callback?success=false&error=' + error;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(deepLink);
        } else {
          window.location.href = deepLink;
        }
      });
      
      facial.addEventListener('sign-error', (e) => {
        log('❌ sign-error - Error genérico');
        // 🆕 Mensaje genérico según versión web
        const error = encodeURIComponent('Usuario no encontrado o problemas con la autenticación');
        const deepLink = 'formssfi://firma-callback?success=false&error=' + error;
        
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(deepLink);
        } else {
          window.location.href = deepLink;
        }
      });
      
      log('👂 Listeners OK');
    }, 1000);
  </script>
</body>
</html>`;

      // Cargar en WebView (como modal, igual que versión web)
      console.log("📄 HTML generado, length:", htmlPage.length);
      setWebViewHtml(htmlPage);
      console.log("✅ WebView modal abierto con componente SFI Facial");
    } catch (error) {
      console.error("❌ Error cargando componente:", error);
      setIsLoading(false);
      setAuthStatus("error");
      setAuthMessage("Error al cargar el componente de firma");
      Alert.alert("Error", "No se pudo cargar la firma: " + error.message);
    }
  };

  // Resetear firma (limpiar todos los estados según versión web)
  const handleReset = () => {
    Alert.alert("Nueva Firma", "¿Deseas capturar una nueva firma?", [
      {
        text: "Sí",
        onPress: () => {
          // 🆕 Resetear TODOS los estados (según versión web)
          setFirmData(null);
          setFirmCompleted(false);
          setFirmError(null);
          setAuthStatus("idle");
          setAuthMessage("");
          setProcessStatus("");
          if (onChange) onChange(null);
          if (onValueChange) onValueChange(null);
        },
      },
      { text: "No", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      {!firmCompleted && (
        <View style={styles.pickerContainer}>
          <TouchableOpacity
            style={[styles.picker, disabled && styles.pickerDisabled]}
            onPress={() => {
              const allOptions = [...options, ...registeredUsers].filter(
                (opt) => opt && opt.id && opt.name
              );

              if (disabled || allOptions.length === 0) {
                if (allOptions.length === 0) {
                  Alert.alert("Sin Usuarios", "No hay usuarios registrados.");
                }
                return;
              }

              // Abrir modal con ScrollView
              setShowUserPickerModal(true);
            }}
            disabled={disabled}
          >
            <Text style={styles.pickerText}>
              {loadingUsers
                ? "Cargando..."
                : selectedUser
                  ? `${selectedUser.name} (${selectedUser.num_document || selectedUser.id})`
                  : "Seleccionar firmante..."}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!firmCompleted && (
        <TouchableOpacity
          style={[
            styles.firmButton,
            (!selectedUserId || disabled) && styles.firmButtonDisabled,
          ]}
          disabled={!selectedUserId || disabled}
          onPress={handleOpenFirm}
        >
          <Text style={styles.firmButtonText}>🖊️ Firmar</Text>
        </TouchableOpacity>
      )}

      {/* 🆕 Estado de autenticación con colores según el tipo */}
      {authStatus && authStatus !== "idle" && (
        <View
          style={[
            styles.statusContainer,
            authStatus === "error" && styles.statusError,
            authStatus === "success" && styles.statusSuccess,
            authStatus === "loading" && styles.statusLoading,
          ]}
        >
          <Text style={styles.statusText}>
            {authStatus === "success" && "🎉 "}
            {authStatus === "error" && "❌ "}
            {authStatus === "loading" && "🔄 "}
            {authMessage}
          </Text>
        </View>
      )}

      {/* 🆕 Estado del proceso (opcional, para más detalle) */}
      {processStatus && (
        <View style={styles.processContainer}>
          <Text style={styles.processText}>{processStatus}</Text>
        </View>
      )}

      {firmCompleted && firmData && (
        <View style={styles.successContainer}>
          <View style={styles.successHeader}>
            <Text style={styles.successIcon}>✅</Text>
            <View style={styles.successContent}>
              <Text style={styles.successTitle}>Firma Completada</Text>
              <Text style={styles.successSubtitle}>{firmData.person_name}</Text>
              <Text style={styles.successDetails}>
                Confianza: {((firmData.confidence_score || 0) * 100).toFixed(1)}
                %
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>🔄 Nueva Firma</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={showModal}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Firma Digital - {selectedUser?.name}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowModal(false);
                setWebViewHtml(null);
              }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={styles.loadingText}>Cargando...</Text>
            </View>
          )}

          {webViewHtml && (
            <WebView
              ref={webViewRef}
              source={{
                html: webViewHtml,
                baseUrl:
                  "https://reconocimiento-facial-safe.service.saferut.com",
              }}
              originWhitelist={["*"]}
              onMessage={handleWebViewMessage}
              onLoad={() => {
                console.log("✅ WebView cargado");
              }}
              onLoadStart={() => {
                console.log("🔄 WebView iniciando carga...");
                setIsLoading(true);
              }}
              onLoadEnd={() => {
                console.log(
                  "✅ WebView carga completada - esperando scripts..."
                );
                // Ocultar loading después de 3 segundos para dar tiempo a que los scripts externos carguen
                setTimeout(() => {
                  setIsLoading(false);
                  console.log("✅ Loading overlay removido");
                }, 3000);
              }}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error("❌ WebView error:", nativeEvent);
                setIsLoading(false);
                setAuthStatus("error");
                setAuthMessage("Error cargando el componente");
              }}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error("❌ WebView HTTP error:", nativeEvent);
              }}
              // Configuraciones avanzadas para soportar scripts externos
              javaScriptEnabled={true}
              domStorageEnabled={true}
              thirdPartyCookiesEnabled={true}
              sharedCookiesEnabled={true}
              cacheEnabled={true}
              cacheMode="LOAD_DEFAULT"
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback={true}
              allowsFullscreenVideo={false}
              geolocationEnabled={false}
              allowFileAccess={true}
              allowUniversalAccessFromFileURLs={true}
              mixedContentMode="always"
              // Inyectar JavaScript después de la carga
              injectedJavaScript={`
                console.log('🎯 JavaScript inyectado ejecutado');
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: '🎯 JavaScript inyectado ejecutado' }));
                true; // note: this is required, or you'll sometimes get silent failures
              `}
              // Ejecutar JS cuando el contenido carga
              injectedJavaScriptBeforeContentLoaded={`
                console.log('⚡ JavaScript pre-carga ejecutado');
                true;
              `}
              style={{ flex: 1, backgroundColor: "transparent" }}
            />
          )}

          {!webViewHtml && showModal && (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, color: "#666" }}>
                Preparando componente...
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal para seleccionar usuario */}
      <Modal
        visible={showUserPickerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUserPickerModal(false)}
      >
        <View style={styles.userPickerOverlay}>
          <View style={styles.userPickerContainer}>
            <View style={styles.userPickerHeader}>
              <Text style={styles.userPickerTitle}>Seleccionar Firmante</Text>
              <TouchableOpacity
                style={styles.userPickerCloseButton}
                onPress={() => setShowUserPickerModal(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.userPickerSubtitle}>
              {
                [...options, ...registeredUsers].filter(
                  (opt) => opt && opt.id && opt.name
                ).length
              }{" "}
              usuario(s) disponibles
            </Text>

            <ScrollView style={styles.userPickerScroll}>
              {[...options, ...registeredUsers]
                .filter((opt) => opt && opt.id && opt.name)
                .map((opt, index) => (
                  <TouchableOpacity
                    key={opt.id || index}
                    style={[
                      styles.userPickerItem,
                      selectedUserId === opt.id &&
                        styles.userPickerItemSelected,
                      !opt.has_face_images && styles.userPickerItemWarning,
                    ]}
                    onPress={() => {
                      console.log(
                        "👤 [FirmField] Usuario seleccionado:",
                        opt.name,
                        opt.id
                      );
                      setSelectedUserId(opt.id);
                      setSelectedUser(opt); // ✅ IMPORTANTE: Guardar el objeto completo del usuario
                      // ❌ NO llamar onChange aquí - solo cuando se complete la firma
                      setShowUserPickerModal(false);
                    }}
                  >
                    <View style={styles.userPickerItemContent}>
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text style={styles.userPickerItemName}>
                          {opt.name}
                        </Text>
                        
                          <Text
                            style={{
                              marginLeft: 8,
                              color: "#4CAF50",
                              fontSize: 12,
                            }}
                          >
                            ✓ Registrado
                          </Text>
                      </View>
                      <Text style={styles.userPickerItemDoc}>
                        Doc: {opt.num_document || opt.id}
                      </Text>
                      {opt.email && (
                        <Text style={styles.userPickerItemEmail}>
                          {opt.email}
                        </Text>
                      )}
                    </View>
                    {selectedUserId === opt.id && (
                      <Text style={styles.userPickerItemCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.userPickerCancelButton}
              onPress={() => setShowUserPickerModal(false)}
            >
              <Text style={styles.userPickerCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 8, color: "#333" },
  required: { color: "#ef4444" },
  pickerContainer: { marginBottom: 12 },
  picker: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
  },
  pickerDisabled: { backgroundColor: "#f3f4f6", opacity: 0.6 },
  pickerText: { fontSize: 14, color: "#374151" },
  firmButton: {
    backgroundColor: "#667eea",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  firmButtonDisabled: { backgroundColor: "#d1d5db", opacity: 0.6 },
  firmButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  statusContainer: {
    backgroundColor: "#d1fae5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusSuccess: { backgroundColor: "#d1fae5" }, // Verde
  statusError: { backgroundColor: "#fee2e2" }, // Rojo
  statusLoading: { backgroundColor: "#dbeafe" }, // Azul
  statusText: { color: "#065f46", fontSize: 14 },
  processContainer: {
    backgroundColor: "#f0f4ff",
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#667eea",
  },
  processText: { color: "#374151", fontSize: 13 },
  successContainer: {
    backgroundColor: "#d1fae5",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  successIcon: { fontSize: 32, marginRight: 12 },
  successContent: { flex: 1 },
  successTitle: { fontSize: 16, fontWeight: "600", color: "#065f46" },
  successSubtitle: { fontSize: 14, color: "#047857", marginTop: 4 },
  successDetails: { fontSize: 12, color: "#059669", marginTop: 4 },
  resetButton: {
    backgroundColor: "#667eea",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  resetButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 18, fontWeight: "600", flex: 1 },
  closeButton: { padding: 8 },
  closeButtonText: { fontSize: 24, color: "#6b7280" },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: "#667eea" },
  // Estilos del modal de selección de usuarios
  userPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  userPickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxHeight: "80%",
    overflow: "hidden",
  },
  userPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  userPickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  userPickerCloseButton: {
    padding: 4,
  },
  userPickerSubtitle: {
    padding: 12,
    paddingTop: 8,
    fontSize: 14,
    color: "#6b7280",
    backgroundColor: "#f9fafb",
  },
  userPickerScroll: {
    maxHeight: 400,
  },
  userPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  userPickerItemSelected: {
    backgroundColor: "#f0f4ff",
  },
  userPickerItemWarning: {
    backgroundColor: "#fff8f0",
    borderLeftWidth: 3,
    borderLeftColor: "#FFA500",
  },
  userPickerItemContent: {
    flex: 1,
  },
  userPickerItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  userPickerItemDoc: {
    fontSize: 14,
    color: "#6b7280",
  },
  userPickerItemEmail: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  userPickerItemCheck: {
    fontSize: 24,
    color: "#667eea",
    marginLeft: 8,
  },
  userPickerCancelButton: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignItems: "center",
  },
  userPickerCancelText: {
    fontSize: 16,
    color: "#6b7280",
    fontWeight: "500",
  },
});

export default FirmField;
