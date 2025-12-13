import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import useNetInfo from "../hooks/useNetInfo";

/**
 * Componente de Registro Facial con WebView Modal
 * Renderiza registro.html directamente en un Modal usando WebView
 * REQUIERE CONEXIÓN ONLINE para funcionar
 */
const FacialRegisterField = ({
  label = "Registro Facial",
  personId = "",
  personName = "",
  personEmail = "",
  required = false,
  disabled = false,
  error = false,
  value,
  onChange,
  onRegisterSuccess,
  onRegisterError,
  apiUrl = "https://api-facialsafe.service.saferut.com",
}) => {
  // Hook de conectividad
  const isOnline = useNetInfo();

  // Estados
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ✅ Parsear value si viene como JSON string
  const parseInitialValue = () => {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn("[Register] No se pudo parsear value:", e);
        return null;
      }
    }
    return value;
  };

  const [registerData, setRegisterData] = useState(parseInitialValue());
  const [registerCompleted, setRegisterCompleted] = useState(!!value);
  const [authStatus, setAuthStatus] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const webViewRef = useRef(null);

  // 🆕 Generar HTML con componente SFI (igual que FirmField)
  const generateRegisterHTML = () => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Registro Facial</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    sfi-facial {
      display: block;
      width: 100%;
      max-width: 600px;
      min-height: 400px;
    }
    #status {
      color: white;
      font-size: 14px;
      margin-top: 20px;
      text-align: center;
      padding: 10px;
      background: rgba(0,0,0,0.3);
      border-radius: 8px;
      max-width: 400px;
    }
  </style>
</head>
<body>
  <div id="container">
    <sfi-facial
      mode="register"
      api-url="${apiUrl}"
      api-timeout="30000"
      ${personId ? `person-id="${personId}"` : ""}
      ${personName ? `person-name="${personName}"` : ""}
    ></sfi-facial>
    <div id="status">Iniciando registro facial...</div>
  </div>

  <script src="https://reconocimiento-facial-safe.service.saferut.com/index.js"></script>
  <script>
    function log(msg) {
      const status = document.getElementById('status');
      if (status) status.textContent = msg;
      console.log('[Register]', msg);
    }

    setTimeout(() => {
      const facial = document.querySelector('sfi-facial');
      if (!facial) {
        log('❌ Error: componente no encontrado');
        return;
      }

      log('✅ Componente cargado');

      // ===== EVENTOS DE REGISTRO =====
      facial.addEventListener('register-success', (e) => {
        log('✅ Registro exitoso');
        console.log('[Register] ===== ANÁLISIS COMPLETO DEL EVENTO =====');
        console.log('[Register] Todas las claves:', Object.keys(e.detail || {}));
        
        // Inspeccionar cada campo
        Object.keys(e.detail || {}).forEach(key => {
          const value = e.detail[key];
          const type = Array.isArray(value) ? 'array' : typeof value;
          const size = Array.isArray(value) ? value.length : (typeof value === 'string' ? value.length : 'N/A');
          console.log(\`[Register] Campo "\${key}": tipo=\${type}, tamaño=\${size}\`);
          
          if (key.toLowerCase().includes('image') || key.toLowerCase().includes('capture') || key.toLowerCase().includes('photo') || key.toLowerCase().includes('frame')) {
            console.log(\`[Register] 🎯 CAMPO RELACIONADO A IMAGEN: "\${key}"\`, value);
          }
        });
        
        console.log('[Register] metadata:', e.detail?.metadata);
        console.log('[Register] face_images:', e.detail?.face_images);
        console.log('[Register] images:', e.detail?.images);
        console.log('[Register] captures:', e.detail?.captures);
        console.log('[Register] embeddings:', e.detail?.embeddings);
        console.log('[Register] image_data:', e.detail?.image_data);
        console.log('[Register] frames:', e.detail?.frames);
        
        const data = JSON.stringify({
          type: 'register-success',
          data: e.detail
        });
        
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(data);
        }
      });

      facial.addEventListener('register-error', (e) => {
        log('❌ Error en registro');
        console.error('[Register] Error:', e.detail);
        
        const error = encodeURIComponent(e.detail?.message || 'Error en el registro facial');
        const data = JSON.stringify({
          type: 'error',
          error: error
        });
        
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(data);
        }
      });

      // ===== EVENTOS DE PROGRESO =====
      facial.addEventListener('liveness-progress', (e) => {
        if (e.detail?.instruction) {
          log(e.detail.instruction);
        }
      });

      facial.addEventListener('cancel', (e) => {
        log('❌ Proceso cancelado');
        const data = JSON.stringify({
          type: 'cancel'
        });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(data);
        }
      });

      log('👂 Listeners configurados');
    }, 1000);
  </script>
</body>
</html>`;
  };

  // Manejar mensajes del WebView (igual que FirmField)
  const handleWebViewMessage = (event) => {
    try {
      const data = event.nativeEvent.data;
      console.log("📨 [Register] Mensaje recibido:", data);

      // Parsear mensaje JSON del componente SFI
      const message = JSON.parse(data);

      if (message.type === "register-success") {
        console.log("✅ [Register] Registro exitoso:", message.data);
        handleRegisterSuccess(message.data);
      } else if (message.type === "error") {
        console.error("❌ [Register] Error:", message.error);
        handleRegisterError(decodeURIComponent(message.error));
      } else if (message.type === "cancel") {
        console.log("❌ [Register] Cancelado por usuario");
        setShowModal(false);
        setIsLoading(false);
      } else {
        console.log("📋 [Register] Mensaje:", message.type);
      }
    } catch (error) {
      console.error("❌ [Register] Error procesando mensaje:", error);
    }
  };

  // Manejar éxito de registro (igual que versión web)
  const handleRegisterSuccess = (backendData) => {
    try {
      console.log(
        "✅ [Register] Datos recibidos del backend:",
        JSON.stringify(backendData, null, 2)
      );
      console.log(
        "✅ [Register] Claves disponibles:",
        Object.keys(backendData)
      );

      // Extraer datos relevantes (igual que versión web)
      const person_id = backendData.person_id || backendData.personId;
      const personName = backendData.person_name || backendData.personName;
      const person_email =
        backendData.person_email || backendData.email || personEmail;

      // Inspeccionar TODOS los campos buscando imágenes
      console.log("🔍 [Register] Inspeccionando campos:");
      Object.keys(backendData).forEach((key) => {
        const value = backendData[key];
        const type = Array.isArray(value)
          ? `array[${value.length}]`
          : typeof value;
        console.log(`   - ${key}: ${type}`);
        if (
          key.toLowerCase().includes("image") ||
          key.toLowerCase().includes("capture")
        ) {
          console.log(`   🎯 POSIBLE CAMPO DE IMAGEN: ${key}`, value);
        }
      });

      // ✅ Las imágenes fueron procesadas en el servidor
      // El backend devuelve image_results con metadata, no las imágenes en base64
      const image_results = backendData.image_results || [];
      const successful_images = backendData.successful_images || 0;
      const total_images = backendData.total_images_processed || 0;

      console.log("📸 [Register] Imágenes procesadas:", total_images);
      console.log("📸 [Register] Imágenes exitosas:", successful_images);
      console.log("📸 [Register] Metadata de imágenes:", image_results);

      // ✅ Formato MÍNIMO para enviar al backend (solo 3 campos obligatorios)
      const registerResultForBackend = {
        faceData: {
          success: true,
          person_id: person_id,
          personName: personName,
        },
      };

      // Formato completo para mostrar en UI (con toda la metadata)
      const registerResultFull = {
        faceData: {
          ...registerResultForBackend.faceData,
          face_images: image_results, // Metadata completa solo para UI
          failed_images: backendData.failed_images || 0,
          overall_quality_score: backendData.overall_quality_score || 0,
        },
      };

      console.log(
        "💾 [Register] Formato simplificado para backend:",
        registerResultForBackend
      );
      console.log(
        "💾 [Register] Formato completo para UI:",
        registerResultFull
      );

      // Guardar versión completa en estado local (para mostrar en UI)
      setRegisterData(registerResultFull);
      setRegisterCompleted(true);
      setAuthStatus("success");
      setAuthMessage("Registro completado exitosamente");
      setShowModal(false);
      setIsLoading(false);

      // ✅ Enviar versión SIMPLIFICADA al formulario (sin metadata pesada de imágenes)
      if (onChange) {
        console.log(
          "📤 [Register] Enviando versión simplificada al formulario"
        );
        onChange(JSON.stringify(registerResultForBackend));
      }

      // Callbacks con versión completa
      if (onRegisterSuccess) {
        onRegisterSuccess(registerResultFull);
      }

      // Validar que los datos sean correctos
      if (person_id && personName) {
        const imagesCount = registerResultFull.faceData.successful_images || 0;
        const embeddings = registerResultFull.faceData.embeddings_count || 0;
        Alert.alert(
          "✅ Registro Facial Exitoso",
          `${personName} ha sido registrado correctamente.\n\n` +
            `ID: ${person_id}\n` +
            `Confianza: ${(registerResultFull.faceData.confidence_score * 100).toFixed(1)}%\n` +
            `Embeddings creados: ${embeddings}\n` +
            `Imágenes capturadas: ${imagesCount}`,
          [{ text: "OK" }]
        );
      } else {
        console.warn(
          "⚠️ [Register] Datos incompletos:",
          registerResultForBackend
        );
        Alert.alert(
          "⚠️ Registro Incompleto",
          "Faltan datos obligatorios (person_id o personName). Por favor, intenta nuevamente.",
          [
            {
              text: "Reintentar",
              onPress: () => {
                setShowModal(true);
                setIsLoading(true);
              },
            },
            { text: "Cancelar", style: "cancel" },
          ]
        );
      }
    } catch (error) {
      console.error("❌ [Register] Error procesando registro:", error);
      handleRegisterError(error.message);
    }
  };

  // Manejar error de registro
  const handleRegisterError = (errorMsg) => {
    console.error("❌ Error en registro:", errorMsg);

    setAuthStatus("error");
    setAuthMessage(errorMsg);
    setShowModal(false);
    setIsLoading(false);

    Alert.alert(
      "❌ Error en el Registro Facial",
      errorMsg ||
        "Ocurrió un error durante el proceso de registro. Por favor, verifica:\n\n• Buena iluminación\n• Rostro visible y centrado\n• Conexión a internet estable",
      [
        {
          text: "Reintentar",
          onPress: () => {
            console.log("🔄 Usuario eligió reintentar registro");
            setAuthStatus("");
            setAuthMessage("");
            setShowModal(true);
            setIsLoading(true);
          },
        },
        { text: "Cancelar", style: "cancel" },
      ]
    );

    if (onRegisterError) {
      onRegisterError(new Error(errorMsg));
    }
  };

  // Abrir modal de registro
  const handleOpenRegister = () => {
    // Validar conexión online (REQUERIDA para registro)
    if (!isOnline) {
      Alert.alert(
        "📡 Sin Conexión",
        "El registro facial requiere conexión a internet.\n\nPor favor, conéctate a una red e intenta nuevamente.",
        [{ text: "Entendido" }]
      );
      return;
    }

    // Para registro facial, NO se requieren datos previos
    // El usuario los ingresará directamente en el WebView
    console.log("🚀 Abriendo modal de registro facial");
    setIsLoading(true);
    setShowModal(true);
  };

  // Cerrar modal
  const handleCloseModal = () => {
    Alert.alert(
      "Cancelar Registro",
      "¿Estás seguro de que deseas cancelar el proceso de registro?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: () => {
            setShowModal(false);
            setIsLoading(false);
          },
        },
      ]
    );
  };

  // Reiniciar para nuevo registro
  const handleReset = () => {
    setRegisterData(null);
    setRegisterCompleted(false);
    setAuthStatus("");
    setAuthMessage("");

    // Limpiar del formulario
    if (onChange) {
      onChange(null);
      console.log("🗑️ Datos de registro eliminados del formulario");
    }
  };

  return (
    <View style={styles.container}>
      {/* Label */}
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      {/* Información de la persona */}
      {personId && personName && !registerCompleted && (
        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>🆔 ID:</Text>
            <Text style={styles.infoValue}>{personId}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>👤 Nombre:</Text>
            <Text style={styles.infoValue}>{personName}</Text>
          </View>
          {personEmail && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>📧 Email:</Text>
              <Text style={styles.infoValue}>{personEmail}</Text>
            </View>
          )}
        </View>
      )}

      {/* Botón de registro */}
      {!registerCompleted && (
        <>
          <TouchableOpacity
            style={[
              styles.registerButton,
              (disabled || !isOnline) && styles.registerButtonDisabled,
            ]}
            disabled={disabled || !isOnline}
            onPress={handleOpenRegister}
            activeOpacity={0.7}
          >
            <Text style={styles.registerButtonText}>
              📸 Iniciar Registro Facial
              {!isOnline && " (Requiere conexión)"}
            </Text>
          </TouchableOpacity>

          {/* Aviso de conexión requerida */}
          {!isOnline && (
            <View style={styles.offlineWarning}>
              <Text style={styles.offlineWarningText}>
                ⚠️ Se requiere conexión a internet para el registro facial
              </Text>
            </View>
          )}
        </>
      )}

      {/* Error de validación */}
      {error && !registerCompleted && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Este campo es obligatorio</Text>
        </View>
      )}

      {/* Mensaje de estado */}
      {authMessage && !registerCompleted && (
        <View
          style={[
            styles.statusContainer,
            authStatus === "error" && styles.statusError,
          ]}
        >
          <Text style={styles.statusText}>{authMessage}</Text>
        </View>
      )}

      {/* Estado de registro completado */}
      {registerCompleted && registerData && registerData.faceData && (
        <View style={styles.successContainer}>
          <View style={styles.successHeader}>
            <Text style={styles.successIcon}>✅</Text>
            <View style={styles.successContent}>
              <Text style={styles.successTitle}>
                Registro Facial Completado
              </Text>
              <Text style={styles.successSubtitle}>
                {registerData.faceData.personName}
              </Text>
              <Text style={styles.successDetails}>
                ID: {registerData.faceData.person_id}
              </Text>
              <Text style={styles.successDetails}>
                Confianza:{" "}
                {((registerData.faceData.confidence_score || 0) * 100).toFixed(
                  1
                )}
                %
              </Text>
              <Text style={styles.successTimestamp}>
                {new Date(registerData.faceData.timestamp).toLocaleString()}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Text style={styles.resetButtonText}>🔄 Nuevo Registro</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal con WebView */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Registro Facial - {personName}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCloseModal}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Loading Overlay */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={styles.loadingText}>
                Cargando componente de registro...
              </Text>
            </View>
          )}

          {/* WebView */}
          <WebView
            ref={webViewRef}
            source={{
              html: generateRegisterHTML(),
              baseUrl: "https://reconocimiento-facial-safe.service.saferut.com",
            }}
            onMessage={handleWebViewMessage}
            onLoadStart={() => {
              console.log("🔄 WebView iniciando carga...");
              setIsLoading(true);
            }}
            onLoadEnd={() => {
              console.log("✅ WebView carga completada");
              setIsLoading(false);
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error("❌ Error en WebView:", nativeEvent);
              handleRegisterError("Error cargando el componente de registro");
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            allowsProtectedMedia={true}
            mixedContentMode="always"
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
            style={styles.webView}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
    fontWeight: "700",
  },
  infoContainer: {
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    width: 80,
  },
  infoValue: {
    fontSize: 13,
    color: "#111827",
    flex: 1,
  },
  registerButton: {
    backgroundColor: "#667eea",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  registerButtonDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
    elevation: 0,
  },
  registerButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  offlineWarning: {
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  offlineWarningText: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    padding: 10,
    borderRadius: 6,
    marginTop: 4,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 12,
  },
  statusContainer: {
    backgroundColor: "#DBEAFE",
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  statusError: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 13,
    color: "#1E40AF",
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
    alignItems: "flex-start",
    marginBottom: 12,
  },
  successIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  successContent: {
    flex: 1,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#065F46",
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 13,
    color: "#047857",
    marginBottom: 4,
  },
  successDetails: {
    fontSize: 12,
    color: "#059669",
    marginBottom: 2,
  },
  successTimestamp: {
    fontSize: 11,
    color: "#10B981",
    marginTop: 4,
  },
  resetButton: {
    backgroundColor: "#667eea",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
  },
  resetButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#667eea",
    ...Platform.select({
      ios: {
        paddingTop: 50,
      },
    }),
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 22,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  webView: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "600",
  },
});

export default FacialRegisterField;
