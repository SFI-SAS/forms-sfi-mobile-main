import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Picker } from "@react-native-picker/picker";
import { WebView } from "react-native-webview";

// 🆕 NUEVA KEY para guardar firmas offline
const OFFLINE_SIGNATURES_KEY = "offline_signatures_cache";

/**
 * Componente de Firma Digital para React Native
 * Con soporte de firma offline automática
 */
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
  apiUrl = "https://api-signfacial-safe.service.saferut.com",
  autoCloseDelay = 10000,
}) => {
  // Estados principales
  const [showModal, setShowModal] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const signingRef = useRef(false);
  const [firmData, setFirmData] = useState(null);
  const [firmError, setFirmError] = useState(null);
  const [processStatus, setProcessStatus] = useState("");
  const [autoCloseTimeoutId, setAutoCloseTimeoutId] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [authStatus, setAuthStatus] = useState("idle");
  const [authMessage, setAuthMessage] = useState("");
  const [firmCompleted, setFirmCompleted] = useState(false);
  
  // 🆕 Nuevo estado para saber si estamos offline
  const [isOffline, setIsOffline] = useState(false);

  const PENDING_SIGNATURES_KEY = "pending_signatures";

  // Obtener datos del usuario seleccionado
  const selectedUser = options.find((user) => user.id === value);

  // 🆕 Detectar estado de conexión
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !state.isConnected;
      setIsOffline(offline);
      console.log("📶 Estado de conexión:", offline ? "OFFLINE" : "ONLINE");
    });

    return () => unsubscribe();
  }, []);

  // 🆕 Cargar firma offline al seleccionar usuario (SOLO SI ESTÁ OFFLINE)
  useEffect(() => {
    const loadOfflineSignature = async () => {
      if (!value || !isOffline) {
        // Si no hay usuario seleccionado O estamos online, no cargar firma offline
        return;
      }

      try {
        const stored = await AsyncStorage.getItem(OFFLINE_SIGNATURES_KEY);
        if (!stored) return;

        const offlineSignatures = JSON.parse(stored);
        const userSignature = offlineSignatures[value];

        if (userSignature) {
          console.log("✅ Cargando firma offline para usuario:", value);
          
          setFirmData(userSignature);
          setFirmCompleted(true);
          setAuthStatus("success");
          setAuthMessage("Firma cargada desde caché offline");
          
          // Notificar al padre
          const completeFirmData = { firmData: userSignature };
          try {
            onFirmSuccess?.(completeFirmData);
            onValueChange?.(completeFirmData);
          } catch (e) {
            console.warn("Error notificando firma offline:", e);
          }
        }
      } catch (e) {
        console.error("❌ Error cargando firma offline:", e);
      }
    };

    loadOfflineSignature();
  }, [value, isOffline]);

  // Resetear estado al cambiar usuario
  useEffect(() => {
    // Solo resetear si estamos ONLINE
    // Si estamos offline, dejamos que se cargue la firma guardada
    if (!isOffline) {
      setFirmCompleted(false);
      setFirmData(null);
      setFirmError(null);
      setAuthStatus("idle");
    }
  }, [value, isOffline]);

  /**
   * 🆕 Guardar firma en caché offline
   */
  const saveSignatureOffline = async (userId, signatureData) => {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_SIGNATURES_KEY);
      const offlineSignatures = stored ? JSON.parse(stored) : {};
      
      offlineSignatures[userId] = signatureData;
      
      await AsyncStorage.setItem(
        OFFLINE_SIGNATURES_KEY,
        JSON.stringify(offlineSignatures)
      );
      
      console.log("💾 Firma guardada offline para usuario:", userId);
    } catch (e) {
      console.error("❌ Error guardando firma offline:", e);
    }
  };

  /**
   * Resetear todos los estados
   */
  const resetStates = () => {
    setFirmData(null);
    setFirmError(null);
    setAuthStatus("idle");
    setAuthMessage("");
    setProcessStatus("");
    setIsLoading(false);
    setCountdown(0);
  };

  /**
   * Solicitar permisos de cámara en Android
   */
  const requestCameraPermissions = async () => {
    if (Platform.OS === "android") {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Permiso de cámara",
            message: "Se requiere acceso a la cámara para el reconocimiento facial",
            buttonNeutral: "Preguntar después",
            buttonNegative: "Cancelar",
            buttonPositive: "Aceptar",
          }
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      } catch (e) {
        console.error("Error pidiendo permiso de cámara:", e);
        return false;
      }
    }
    return true;
  };

  /**
   * Iniciar proceso de firma
   */
  const handleFirmar = async () => {
    if (signingRef.current) return;
    
    if (!selectedUser) {
      setFirmError("Debe seleccionar un usuario antes de firmar");
      Alert.alert("Error", "Debe seleccionar un usuario antes de firmar");
      return;
    }
    
    if (!documentHash) {
      setFirmError("No se ha proporcionado el hash del documento a firmar");
      Alert.alert("Error", "No se ha proporcionado el hash del documento a firmar");
      return;
    }

    // 🆕 Si estamos OFFLINE y ya hay firma guardada, usarla automáticamente
    if (isOffline && firmCompleted && firmData) {
      Alert.alert(
        "Modo Offline",
        "Se usará la firma guardada previamente para este usuario.",
        [{ text: "OK" }]
      );
      return;
    }

    const permsOk = await requestCameraPermissions();
    if (!permsOk) {
      Alert.alert(
        "Permisos necesarios",
        "Se requiere permiso de cámara para el reconocimiento facial."
      );
      return;
    }

    signingRef.current = true;
    setIsSigning(true);
    setIsLoading(true);

    try {
      setProcessStatus("Abriendo componente de firma...");
      setIsScriptLoaded(false);
      setShowModal(true);
    } catch (e) {
      console.error("Error abriendo componente de firma:", e);
      onFirmError?.(e);
      Alert.alert("Error", "No se pudo abrir el componente de firma.");
    } finally {
      signingRef.current = false;
      setIsSigning(false);
      setIsLoading(false);
      setProcessStatus("");
    }
  };

  /**
   * Cerrar modal
   */
  const handleCloseModal = () => {
    if (autoCloseTimeoutId) {
      clearTimeout(autoCloseTimeoutId);
      setAutoCloseTimeoutId(null);
    }
    setShowModal(false);
    resetStates();
    console.log("🔒 Modal cerrado");
  };

  /**
   * Manejar mensajes desde el WebView
   */
  const handleWebViewMessage = async (event) => {
    try {
      const raw = event?.nativeEvent?.data;
      if (!raw) return;
      const msg = JSON.parse(raw);
      const { type, ...payload } = msg;

      console.log("📥 Mensaje desde WebView:", type, payload);

      if (type === "script-loaded") {
        setIsScriptLoaded(true);
        setProcessStatus("Componente de firma listo");
        return;
      }

      if (type === "script-error") {
        setFirmError(payload.error || "Error cargando script");
        setAuthStatus("error");
        setProcessStatus("");
        onFirmError?.(payload);
        return;
      }

      if (type === "sign-start") {
        setProcessStatus("Iniciando flujo de firma...");
        setAuthStatus("loading");
        return;
      }

      if (type === "sign-success" || type === "sign-response") {
        handleSignSuccess(payload);
        return;
      }

      if (type === "liveness-progress") {
        setProcessStatus(`Liveness: ${payload.progress || ""}`);
        return;
      }

      if (
        type === "sign-error" ||
        type === "sign-network-error" ||
        type === "sign-timeout-error" ||
        type === "sign-validation-failed"
      ) {
        setFirmError(payload || "Error en el proceso de firma");
        setAuthStatus("error");
        setProcessStatus("");
        onFirmError?.(payload);
        return;
      }
    } catch (e) {
      console.warn("⚠️ handleWebViewMessage parse error:", e, event);
    }
  };

  const handleSignSuccess = async (data = {}) => {
    try {
      console.log('📥 Datos completos recibidos desde SFI Facial (firma):', data);

      setFirmData(data);
      setFirmError(null);
      setIsLoading(false);
      setProcessStatus("🎉 Firma completada exitosamente");
      setAuthStatus("success");
      setAuthMessage("Autenticación y firma completadas exitosamente");
      setFirmCompleted(true);

      const filteredFirmData = {
        success: true,
        person_id: data.person_id || data.personId || data.person_id,
        person_name: data.person_name || data.personName || data.name,
        qr_url: data.qr_url || data.qrUrl || data.qr || null,
        raw: data,
      };

      const completeFirmData = { firmData: filteredFirmData };

      console.log("📦 Datos filtrados que se pasarán al padre:", completeFirmData);

      // 🆕 Guardar firma offline para uso futuro
      if (value) {
        await saveSignatureOffline(value, filteredFirmData);
      }

      try {
        onFirmSuccess?.(completeFirmData);
      } catch (e) {
        console.warn("onFirmSuccess falló:", e);
      }
      
      try {
        onValueChange?.(completeFirmData);
      } catch (e) {
        console.warn("onValueChange falló:", e);
      }

      // Encolar para sincronización
      (async () => {
        try {
          const stored = await AsyncStorage.getItem(PENDING_SIGNATURES_KEY);
          const arr = stored ? JSON.parse(stored) : [];
          arr.push({
            payload: completeFirmData,
            person_id: filteredFirmData.person_id,
            document_hash: documentHash || null,
            savedAt: Date.now(),
          });
          await AsyncStorage.setItem(PENDING_SIGNATURES_KEY, JSON.stringify(arr));
        } catch (e) {
          console.warn("No se pudo encolar firma en AsyncStorage:", e);
        }
      })();

      setTimeout(() => {
        setShowModal(false);
        resetStates();
      }, 300);
    } catch (e) {
      console.error("Error procesando firma exitosa:", e);
      onFirmError?.(e);
    }
  };

  /**
   * Obtener configuración visual según el estado de autenticación
   */
  const getAuthStatusDisplay = () => {
    switch (authStatus) {
      case "success":
        return {
          message: "🎉 Autenticación Exitosa",
          subMessage: authMessage,
          bgColor: "#D1FAE5",
          borderColor: "#A7F3D0",
          textColor: "#065F46",
          icon: "🎉",
        };
      case "error":
      case "network-error":
      case "validation-failed":
      case "timeout":
        return {
          message: "❌ Autenticación Fallida",
          subMessage: authMessage || "Usuario no encontrado o problemas con la autenticación",
          bgColor: "#FEE2E2",
          borderColor: "#FECACA",
          textColor: "#991B1B",
          icon: "❌",
        };
      case "loading":
        return {
          message: "🔄 Autenticando...",
          subMessage: authMessage || "Verificando identidad...",
          bgColor: "#DBEAFE",
          borderColor: "#BFDBFE",
          textColor: "#1E40AF",
          icon: "🔄",
        };
      default:
        return null;
    }
  };

  const authDisplay = getAuthStatusDisplay();

  /**
   * HTML para el WebView con integración SFI Facial
   */
  const getWebViewHTML = () => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Firma Digital</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #F7FAFC;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        #container {
            width: 100%;
            max-width: 500px;
        }
        .loading {
            text-align: center;
            padding: 40px 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .spinner {
            border: 4px solid #E2E8F0;
            border-top: 4px solid #0F8593;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .loading-text {
            color: #4A5568;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div id="container">
        <div class="loading">
            <div class="spinner"></div>
            <div class="loading-text">Cargando librería SFI Facial...</div>
        </div>
    </div>

    <script>
        function sendMessage(type, data = {}) {
            const message = JSON.stringify({ type, ...data });
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(message);
            }
            console.log('📤 Enviando mensaje a RN:', message);
        }

        const script = document.createElement('script');
        script.src = 'https://reconocimiento-facial-safe.service.saferut.com/index.js';
        script.async = true;
        
        script.onload = () => {
            console.log('✅ Script SFI Facial cargado');
            sendMessage('script-loaded');
            initSFIFacial();
        };
        
        script.onerror = (error) => {
            console.error('❌ Error cargando SFI Facial:', error);
            sendMessage('script-error', { error: error.message });
        };

        document.head.appendChild(script);

        function initSFIFacial() {
            const container = document.getElementById('container');
            container.innerHTML = '';

            const sfiFacialElement = document.createElement('sfi-facial');
            sfiFacialElement.id = 'sfiFacialSign';
            sfiFacialElement.setAttribute('mode', 'sign');
            sfiFacialElement.setAttribute('api-url', '${apiUrl}');
            sfiFacialElement.setAttribute('api-timeout', '120000');
            sfiFacialElement.setAttribute('person-id', '${selectedUser?.id || ""}');
            sfiFacialElement.setAttribute('person-name', '${selectedUser?.name || ""}');
            sfiFacialElement.setAttribute('document-hash', '${documentHash}');

            sfiFacialElement.setAttribute('button-bg-color', 'linear-gradient(135deg, #0F8593 0%, #0A6370 100%)');
            sfiFacialElement.setAttribute('button-text-color', '#ffffff');
            sfiFacialElement.setAttribute('button-border-radius', '12px');
            sfiFacialElement.setAttribute('button-font-size', '16px');
            sfiFacialElement.setAttribute('button-padding', '14px 28px');
            sfiFacialElement.setAttribute('button-box-shadow', '0 4px 12px rgba(15, 133, 147, 0.3)');
            sfiFacialElement.setAttribute('button-hover-transform', 'scale(1.05)');
            sfiFacialElement.setAttribute('button-hover-box-shadow', '0 6px 16px rgba(15, 133, 147, 0.4)');

            container.appendChild(sfiFacialElement);

            const events = [
                'liveness-progress', 'sign-start', 'sign-validation-start',
                'sign-validation-progress', 'sign-request-start', 'sign-request-progress',
                'sign-validation-result', 'sign-response', 'sign-success', 'sign-error',
                'sign-timeout-error', 'sign-network-error', 'sign-validation-failed',
                'component-ready', 'camera-ready', 'liveness-start', 'liveness-complete',
                'face-detected', 'gesture-detected'
            ];

            events.forEach(eventName => {
                sfiFacialElement.addEventListener(eventName, (event) => {
                    console.log(\`📡 Evento: \${eventName}\`, event.detail);
                    sendMessage(eventName, event.detail);
                });
            });

            setTimeout(() => {
                if (typeof sfiFacialElement.start === 'function') {
                    sfiFacialElement.start();
                    console.log('✅ Método start() ejecutado');
                }
            }, 1000);

            setTimeout(() => {
                const shadowButton = sfiFacialElement.shadowRoot?.querySelector('button');
                const normalButton = sfiFacialElement.querySelector('button');
                
                if (shadowButton && shadowButton.offsetWidth > 0) {
                    shadowButton.click();
                    console.log('🎯 Click en shadow button');
                } else if (normalButton && normalButton.offsetWidth > 0) {
                    normalButton.click();
                    console.log('🎯 Click en normal button');
                }
            }, 2500);
        }
    </script>
</body>
</html>
    `;
  };

  return (
    <View style={styles.container}>
      {/* Label */}
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      {/* 🆕 Indicador de modo offline */}
      {isOffline && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>📵 Modo Offline</Text>
        </View>
      )}

      {/* Selector de Usuario + Botón Firmar */}
      <View style={styles.inputRow}>
        <View style={[styles.pickerContainer, error && styles.pickerError]}>
<Picker
  selectedValue={value || ""}
  onValueChange={(itemValue) => {
    console.log("🔄 Picker onChange - valor seleccionado:", itemValue);
    if (onChange) {
      onChange({ target: { value: itemValue } });
    }
  }}
  enabled={!disabled && options.length > 0} // 🆕 Deshabilitar si no hay opciones
  style={styles.picker}
>
  <Picker.Item 
    label={options.length === 0 
      ? "No hay usuarios disponibles - Verifica tu conexión" 
      : "Seleccionar usuario para firmar..."} 
    value="" 
  />
  {options.map((user) => (
    <Picker.Item
      key={user.id}
      label={`${user.name} - ${user.num_document}`}
      value={user.id}
    />
  ))}
</Picker>
        </View>

        <TouchableOpacity
          style={[
            styles.firmButton,
            (!value || value === "" || disabled || isSigning) && styles.firmButtonDisabled,
            firmCompleted && styles.firmButtonSuccess,
          ]}
          disabled={!value || value === "" || disabled || isSigning}
          onPress={handleFirmar}
          activeOpacity={0.7}
        >
          <Text style={styles.firmButtonText}>
            {firmCompleted ? (isOffline ? "✅ Firma Offline" : "✅ Firmado") : "🖊️ Firmar"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error de validación */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Este campo es obligatorio</Text>
        </View>
      )}

      {/* Error de firma */}
      {firmError && (
        <View style={styles.firmErrorContainer}>
          <Text style={styles.firmErrorText}>❌ {firmError}</Text>
        </View>
      )}

      {/* Estado de firma exitosa */}
      {firmCompleted && firmData && (
        <View style={styles.successContainer}>
          <View style={styles.successHeader}>
            <Text style={styles.successIcon}>✅</Text>
            <View style={styles.successTextContainer}>
              <Text style={styles.successTitle}>
                {isOffline ? "Firma cargada (offline)" : "Firma completada exitosamente"}
              </Text>
              <Text style={styles.successSubtitle}>
                Usuario: {firmData.person_name || 'Sin nombre'}
              </Text>
              <Text style={styles.successDetails}>
                ID: {firmData.person_id || 'Sin ID'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Modal de Firma */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🖊️ Firma Digital</Text>
                {selectedUser && (
                  <Text style={styles.modalSubtitle}>
                    Usuario: {selectedUser.name} - {selectedUser.num_document}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {authDisplay && (
                <View
                  style={[
                    styles.authStatusContainer,
                    {
                      backgroundColor: authDisplay.bgColor,
                      borderColor: authDisplay.borderColor,
                    },
                  ]}
                >
                  <View style={styles.authStatusContent}>
                    <Text style={styles.authIcon}>{authDisplay.icon}</Text>
                    <View style={styles.authTextContainer}>
                      <Text style={[styles.authMessage, { color: authDisplay.textColor }]}>
                        {authDisplay.message}
                      </Text>
                      <Text style={[styles.authSubMessage, { color: authDisplay.textColor }]}>
                        {authDisplay.subMessage}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {processStatus && (
                <View style={styles.processStatusContainer}>
                  <Text style={styles.processStatusText}>Estado: {processStatus}</Text>
                </View>
              )}

              {showModal ? (
                <View style={styles.webViewContainer}>
                  <WebView
                    source={{
                      html: getWebViewHTML(),
                      baseUrl: "https://reconocimiento-facial-safe.service.saferut.com/index.js",
                    }}
                    originWhitelist={["*"]}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback={true}
                    mixedContentMode="always"
                    allowUniversalAccessFromFileURLs={true}
                    startInLoadingState={true}
                    onMessage={handleWebViewMessage}
                    onError={(e) => {
                      console.error("WebView error:", e.nativeEvent || e);
                      setFirmError("Error cargando componente de firma");
                    }}
                    style={styles.webView}
                  />
                </View>
              ) : (
                <View style={styles.loadingWebViewContainer}>
                  <ActivityIndicator size="large" color="#0F8593" />
                  <Text style={styles.loadingWebViewText}>
                    Preparando componente de firma...
                  </Text>
                </View>
              )}

              {countdown > 0 && (
                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownText}>
                    Cerrando automáticamente en {countdown}s
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 8,
  },
  required: {
    color: "#F56565",
  },
  offlineBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  offlineBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  pickerError: {
    borderColor: "#F56565",
  },
  picker: {
    height: 48,
  },
  firmButton: {
    backgroundColor: "#0F8593",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 100,
  },
  firmButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },
  firmButtonSuccess: {
    backgroundColor: "#10B981",
  },
  firmButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  errorContainer: {
    marginTop: 4,
    backgroundColor: "#FEE2E2",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 12,
    color: "#991B1B",
  },
  firmErrorContainer: {
    marginTop: 8,
    backgroundColor: "#FEE2E2",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  firmErrorText: {
    fontSize: 12,
    color: "#991B1B",
  },
  successContainer: {
    marginTop: 8,
    backgroundColor: "#D1FAE5",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  successIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  successTextContainer: {
    flex: 1,
  },
  successTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#065F46",
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 12,
    color: "#047857",
    marginBottom: 2,
  },
  successDetails: {
    fontSize: 11,
    color: "#059669",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A202C",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#718096",
    marginTop: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#F7FAFC",
  },
  closeButtonText: {
    fontSize: 20,
    color: "#4A5568",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  authStatusContainer: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  authStatusContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  authIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  authTextContainer: {
    flex: 1,
  },
  authMessage: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  authSubMessage: {
    fontSize: 14,
    opacity: 0.8,
  },
  processStatusContainer: {
    backgroundColor: "#DBEAFE",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  processStatusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
  },
  webViewContainer: {
    height: 400,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F7FAFC",
    marginBottom: 16,
  },
  webView: {
    flex: 1,
  },
  loadingWebViewContainer: {
    height: 400,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    borderRadius: 8,
    marginBottom: 16,
  },
  loadingWebViewText: {
    marginTop: 12,
    fontSize: 14,
    color: "#4A5568",
  },
  countdownContainer: {
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  countdownText: {
    fontSize: 13,
    color: "#92400E",
    textAlign: "center",
    fontWeight: "600",
  },
});

export default FirmField;