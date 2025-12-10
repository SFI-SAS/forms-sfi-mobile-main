/**
 * FacialRecognitionWebView.tsx
 * Componente de reconocimiento facial usando WebView
 * Carga la misma librería que usa PC: https://reconocimiento-facial-safe.service.saferut.com
 */

import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Modal, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';

interface FacialRecognitionWebViewProps {
    visible: boolean;
    mode: 'register' | 'validate' | 'sign';
    personId?: string;
    personName?: string;
    documentHash?: string;
    onSuccess?: (data: any) => void;
    onError?: (error: any) => void;
    onCancel?: () => void;
}

const FacialRecognitionWebView: React.FC<FacialRecognitionWebViewProps> = ({
    visible,
    mode,
    personId,
    personName,
    documentHash,
    onSuccess,
    onError,
    onCancel
}) => {
    const webViewRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('Cargando...');
    const [scriptContent, setScriptContent] = useState<string | null>(null);

    // 🔧 CRÍTICO: Pre-cargar el script JavaScript ANTES de renderizar el WebView
    useEffect(() => {
        let isMounted = true;

        const loadScript = async () => {
            try {
                console.log('📥 Descargando script de SFI Facial...');
                const response = await fetch('https://reconocimiento-facial-safe.service.saferut.com/index.js', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/javascript, text/javascript, */*',
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const script = await response.text();

                if (isMounted) {
                    console.log(`✅ Script descargado exitosamente (${(script.length / 1024).toFixed(2)} KB)`);
                    setScriptContent(script);
                }
            } catch (error) {
                console.error('❌ Error descargando script:', error);
                if (isMounted) {
                    setStatus('Error cargando componente');
                    onError?.({ message: 'No se pudo cargar el script de reconocimiento facial', details: error });
                }
            }
        };

        loadScript();

        return () => {
            isMounted = false;
        };
    }, [onError]);

    // HTML que se carga en el WebView - igual que PC
    // 🔧 NO incluir <script src="..."> porque Android WebView lo bloquea
    const getHtmlContent = () => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Reconocimiento Facial</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f3f4f6;
      padding: 16px;
      overflow-x: hidden;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    
    .status-bar {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      font-weight: 500;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .facial-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      overflow: hidden;
      position: relative;
      min-height: 500px;
    }
    
    sfi-facial {
      display: block;
      width: 100%;
      min-height: 500px;
      height: auto;
    }
    
    /* Asegurar que el video de la cámara sea visible */
    sfi-facial video {
      width: 100% !important;
      height: auto !important;
      display: block !important;
    }
    
    sfi-facial canvas {
      width: 100% !important;
      height: auto !important;
      display: block !important;
    }
    
    .manual-start-btn {
      margin: 16px auto;
      display: block;
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    }
    
    .manual-start-btn:active {
      transform: scale(0.95);
    }
    
    .hidden {
      display: none !important;
    }
    
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      color: #6b7280;
    }
    
    .error {
      padding: 20px;
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-bar" id="statusBar">
      Inicializando reconocimiento facial...
    </div>
    
    <div class="facial-container">
      <div class="loading" id="loading">
        <span>⏳ Cargando componente...</span>
      </div>
      
      <sfi-facial
        id="facialComponent"
        mode="${mode}"
        api-url="https://api-facialsafe.service.saferut.com"
        api-timeout="150000"
        ${personId ? `person-id="${personId}"` : ''}
        ${personName ? `person-name="${personName}"` : ''}
        ${documentHash ? `document-hash="${documentHash}"` : ''}
      ></sfi-facial>
    </div>
  </div>

  <!-- ⚠️ NO CARGAR SCRIPT EXTERNO: Android WebView lo bloquea por seguridad -->
  <!-- El script se inyectará usando injectedJavaScript después de que el HTML cargue -->
  
  <script>
    console.log('📱 HTML base cargado, esperando inyección de script...');
    
    // Verificar que window.ReactNativeWebView existe
    if (!window.ReactNativeWebView) {
      console.error('❌ window.ReactNativeWebView NO disponible!');
    } else {
      console.log('✅ window.ReactNativeWebView disponible');
    }
    
    // Enviar logs a React Native
    function logToRN(message, level = 'log') {
      console[level](message);
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'log',
            level: level,
            message: message
          }));
        }
      } catch (e) {
        console.error('Error enviando log a RN:', e);
      }
    }
    
    window.logToRN = logToRN;
    window.updateStatus = updateStatus;
    window.sendToReactNative = sendToReactNative;
    window.initializeFacialComponent = initializeFacialComponent;
    
    let facialElement = null;
    let checkInterval = null;
    let checkAttempts = 0;
    const maxAttempts = 100; // 10 segundos (100ms * 100)
    
    function updateStatus(message) {
      const statusBar = document.getElementById('statusBar');
      if (statusBar) {
        statusBar.textContent = message;
      }
      
      logToRN(message);
      
      // Enviar mensaje a React Native
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'status',
            message: message
          }));
        }
      } catch (e) {
        logToRN('Error enviando status: ' + e.toString(), 'error');
      }
    }
    
    function sendToReactNative(type, data) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: type,
            data: data
          }));
        }
      } catch (e) {
        logToRN('Error enviando a RN: ' + e.toString(), 'error');
      }
    }
    
    // Iniciar polling después de que el script SFI Facial se inyecte
    function initializeFacialComponent() {
      checkAttempts++;
      
      logToRN('Intento ' + checkAttempts + ': Verificando customElements...');
      
      if (window.customElements && window.customElements.get('sfi-facial')) {
        logToRN('✅ customElements.get(sfi-facial) encontrado!');
        
        facialElement = document.getElementById('facialComponent');      logToRN('Intento ' + checkAttempts + ': Verificando customElements...');
      
      if (window.customElements && window.customElements.get('sfi-facial')) {
        logToRN('✅ customElements.get(sfi-facial) encontrado!');
        
        facialElement = document.getElementById('facialComponent');
        
        if (facialElement) {
          logToRN('✅ Elemento facial encontrado, configurando...');
          
          // Log del estado del elemento
          logToRN('📊 Estado del elemento:');
          logToRN('  - tagName: ' + facialElement.tagName);
          logToRN('  - isConnected: ' + facialElement.isConnected);
          logToRN('  - mode: ' + facialElement.getAttribute('mode'));
          logToRN('  - api-url: ' + facialElement.getAttribute('api-url'));
          
          // Verificar si el elemento ya está conectado al DOM
          if (!facialElement.isConnected) {
            logToRN('⚠️ Elemento no conectado al DOM, esperando...', 'warn');
            return; // Seguir intentando
          }
          
          // Ocultar loading
          const loadingEl = document.getElementById('loading');
          if (loadingEl) loadingEl.style.display = 'none';
          
          updateStatus('Componente cargado. Iniciando cámara...');
          
          // Registrar event listeners según el modo
          if ('${mode}' === 'register') {
            facialElement.addEventListener('register-success', (event) => {
              updateStatus('✅ Registro exitoso');
              sendToReactNative('success', event.detail);
            });
            
            facialElement.addEventListener('register-error', (event) => {
              updateStatus('❌ Error en registro');
              sendToReactNative('error', event.detail);
            });
          }
          
          if ('${mode}' === 'validate') {
            facialElement.addEventListener('validate-complete', (event) => {
              updateStatus('✅ Validación exitosa');
              sendToReactNative('success', event.detail);
            });
            
            facialElement.addEventListener('validate-result', (event) => {
              updateStatus('Validando...');
            });
          }
          
          if ('${mode}' === 'sign') {
            facialElement.addEventListener('sign-success', (event) => {
              updateStatus('✅ Firma exitosa');
              sendToReactNative('success', event.detail);
            });
            
            facialElement.addEventListener('sign-error', (event) => {
              updateStatus('❌ Error en firma');
              sendToReactNative('error', event.detail);
            });
          }
          
          // Eventos generales
          facialElement.addEventListener('cancel', () => {
            updateStatus('❌ Cancelado');
            sendToReactNative('cancel', null);
          });
          
          facialElement.addEventListener('liveness-progress', (event) => {
            if (event.detail && event.detail.instruction) {
              updateStatus(event.detail.instruction);
            }
          });
          
          facialElement.addEventListener('error', (event) => {
            logToRN('❌ Error del componente facial: ' + JSON.stringify(event.detail), 'error');
            updateStatus('❌ Error: ' + (event.detail?.message || 'Error desconocido'));
            sendToReactNative('error', event.detail);
          });
          
          logToRN('✅ Event listeners registrados. El componente debería auto-inicializarse.');
          
          // Verificar si hay shadow DOM
          if (facialElement.shadowRoot) {
            logToRN('✅ Shadow DOM encontrado');
          } else {
            logToRN('⚠️ No se encontró shadow DOM (aún)');
          }
          
          clearInterval(checkInterval);
          sendToReactNative('ready', null);
        }
      } else {
        if (checkAttempts % 10 === 0) {
          logToRN('⏳ Esperando customElements... (intento ' + checkAttempts + ')');
        }
        
        if (checkAttempts >= maxAttempts) {
          clearInterval(checkInterval);
          logToRN('❌ Timeout: customElements no disponible después de ' + checkAttempts + ' intentos', 'error');
          updateStatus('❌ Error: Componente no disponible');
          sendToReactNative('error', { message: 'Timeout: customElements no disponible' });
        }
      }
    }
    
    // ⏳ NO iniciar polling aquí - esperar a que React Native inyecte el script
    logToRN('✅ HTML base listo. Esperando inyección del script SFI Facial...');
  </script>
</body>
</html>
  `;

    const handleMessage = (event: any) => {
        try {
            const message = JSON.parse(event.nativeEvent.data);

            switch (message.type) {
                case 'log':
                    // Reenviar logs del WebView a la consola de React Native
                    const logLevel = message.level || 'log';
                    const logMessage = `[WebView] ${message.message}`;
                    if (logLevel === 'error') {
                        console.error(logMessage);
                    } else if (logLevel === 'warn') {
                        console.warn(logMessage);
                    } else {
                        console.log(logMessage);
                    }
                    break;

                case 'status':
                    setStatus(message.message);
                    break;

                case 'ready':
                    setLoading(false);
                    break;

                case 'success':
                    setLoading(false);
                    // Extraer datos relevantes
                    const relevantData = {
                        success: true,
                        person_id: message.data?.person_id || message.data?.personId,
                        personName: message.data?.person_name || message.data?.personName,
                        signature_id: message.data?.signature_id,
                        confidence_score: message.data?.confidence_score,
                        timestamp: message.data?.timestamp
                    };
                    onSuccess?.(relevantData);
                    break;

                case 'error':
                    setLoading(false);
                    onError?.(message.data);
                    break;

                case 'cancel':
                    setLoading(false);
                    onCancel?.();
                    break;
            }
        } catch (err) {
            console.error('Error parseando mensaje:', err);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={onCancel}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>
                        {mode === 'register' && '📸 Registro Facial'}
                        {mode === 'validate' && '🔍 Validación Facial'}
                        {mode === 'sign' && '✍️ Firma Facial'}
                    </Text>
                    <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                </View>

                {/* Status */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#667eea" />
                        <Text style={styles.statusText}>{status}</Text>
                    </View>
                )}

                {/* WebView */}
                {scriptContent ? (
                    <WebView
                        ref={webViewRef}
                        source={{ html: getHtmlContent() }}
                        style={styles.webview}
                        onMessage={handleMessage}
                        mediaPlaybackRequiresUserAction={false}
                        allowsInlineMediaPlayback={true}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        startInLoadingState={false}
                        cacheEnabled={false}
                        // ✅ CRÍTICO: Inyectar ANTES de cargar el contenido HTML
                        injectedJavaScriptBeforeContentLoaded={`
                            try {
                                console.log('📥 Inyectando script SFI Facial ANTES del HTML (${(scriptContent.length / 1024).toFixed(2)} KB)...');
                                
                                // Ejecutar el script SFI Facial
                                ${scriptContent}
                                
                                console.log('✅ Script SFI Facial inyectado exitosamente');
                                window.sfiFacialScriptLoaded = true;
                                
                            } catch (error) {
                                console.error('❌ Error inyectando script:', error);
                                window.sfiFacialScriptError = error.toString();
                            }
                        `}
                        // ✅ Inyectar DESPUÉS para iniciar el polling
                        injectedJavaScript={`
                            try {
                                if (window.sfiFacialScriptLoaded) {
                                    console.log('✅ Script cargado, iniciando polling...');
                                    if (window.initializeFacialComponent) {
                                        window.checkInterval = setInterval(window.initializeFacialComponent, 100);
                                        window.initializeFacialComponent();
                                    } else {
                                        console.error('❌ window.initializeFacialComponent no existe');
                                    }
                                } else if (window.sfiFacialScriptError) {
                                    console.error('❌ Script no cargado:', window.sfiFacialScriptError);
                                } else {
                                    console.warn('⚠️ Script status desconocido');
                                }
                            } catch (error) {
                                console.error('❌ Error iniciando polling:', error);
                            }
                            true; // Return true to avoid warnings
                        `}
                        // ✅ CRÍTICO: Permitir carga de recursos externos (MediaPipe CDN)
                        originWhitelist={['*']}
                        // ✅ CRÍTICO: Habilitar recursos mixtos (HTTP/HTTPS)
                        mixedContentMode="always"
                        // Permisos para cámara
                        mediaCapturePermissionGrantType="grant"
                        onLoadStart={() => {
                            console.log('🌐 WebView: Iniciando carga...');
                            setLoading(true);
                            setStatus('Cargando componente...');
                        }}
                        onLoadEnd={() => {
                            console.log('✅ WebView: Carga completada');
                        }}
                        onError={(syntheticEvent) => {
                            const { nativeEvent } = syntheticEvent;
                            console.error('❌ WebView error:', nativeEvent);
                            setStatus('Error al cargar');
                            onError?.({ message: 'Error al cargar WebView', details: nativeEvent });
                        }}
                        onHttpError={(syntheticEvent) => {
                            const { nativeEvent } = syntheticEvent;
                            console.error('❌ WebView HTTP error:', nativeEvent);
                            setStatus('Error de red');
                        }}
                    />
                ) : (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#667eea" />
                        <Text style={styles.statusText}>Descargando componente facial...</Text>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f3f4f6'
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        flex: 1
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#fee2e2',
        alignItems: 'center',
        justifyContent: 'center'
    },
    closeButtonText: {
        fontSize: 18,
        color: '#dc2626',
        fontWeight: 'bold'
    },
    loadingContainer: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10
    },
    statusText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center'
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent'
    }
});

export default FacialRecognitionWebView;
