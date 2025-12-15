/**
 * FormatScreen.tsx - NUEVA VERSIÓN
 * Versión refactorizada usando arquitectura de PC
 * - Usa endpoints PC: /forms/{id}/form_design + /forms/{id}/questions
 * - Sincronización automática online/offline con AsyncStorage
 * - Renderizado modular con FormRenderer
 * - ~400 líneas vs 4,400 anteriores
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ScrollView,
    ActivityIndicator,
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    Dimensions
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { isOnline as checkOnlineStatus } from '../services/offlineManager';
import ConnectionIndicator from './ConnectionIndicator';

// Nuevos imports
import { syncFormData, getSyncStatus } from '../utils/FormSyncManager';
import { submitFormResponses } from '../utils/ResponseAdapter';
import { EnrichedFormData } from '../utils/FormDataAdapter';
import FormRenderer from './FormRenderer/FormRenderer';
import { CircleInfoIcon, HomeIcon } from './Icons';
import { AlertMessageModal } from './AlertMessageModal';
import { InstructivosSection } from './InstructivosSection';
import { getFormAlertMessage, getFormInstructivos } from '../services/api';

export default function FormatScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const formId = parseInt(id as string);

    // Estados principales
    const [formData, setFormData] = useState<EnrichedFormData | null>(null);
    const [formValues, setFormValues] = useState<Record<string, any>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // 🆕 Estados para alertas e instructivos
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [showAlertModal, setShowAlertModal] = useState(false);
    const [alertAccepted, setAlertAccepted] = useState(false);
    const [instructivos, setInstructivos] = useState<any[]>([]);

    /**
     * Carga datos del formulario (online/offline automático)
     */
    const loadFormData = useCallback(async () => {
        try {
            setLoading(true);
            console.log(`📋 [FormatScreen] Cargando formulario ${formId}...`);

            // Detectar conexión usando offlineManager
            const online = await checkOnlineStatus();
            setIsOnline(online);
            console.log(
                `📋 [FormatScreen] Modo: ${online ? '🌐 ONLINE' : '📵 OFFLINE'}`
            );

            // Obtener estado de sincronización
            const syncStatus = await getSyncStatus(formId);
            setLastSync(syncStatus.lastSync);

            console.log(`💾 [FormatScreen] Datos locales: ${syncStatus.hasLocalData ? 'SÍ' : 'NO'}`);

            // Sincronizar datos (usa AsyncStorage si está offline)
            const enrichedData = await syncFormData(formId);

            // 🔍 LOG COMPLETO DE LA ESTRUCTURA DEL FORMULARIO
            console.log('═══════════════════════════════════════════════════════════');
            console.log(`📦 [FormatScreen] ESTRUCTURA COMPLETA DEL FORMULARIO`);
            console.log('═══════════════════════════════════════════════════════════');
            console.log(JSON.stringify(enrichedData.formStructure, null, 2));
            console.log('═══════════════════════════════════════════════════════════');

            setFormData(enrichedData);
            setFormValues({});
            setErrors({});

            console.log(`✅ [FormatScreen] Formulario cargado: ${enrichedData.metadata.title}`);
            console.log(`📊 [FormatScreen] ${enrichedData.formStructure.length} elementos en estructura`);

            // 🆕 Cargar mensaje de alerta e instructivos (solo si está online)
            if (syncStatus.isOnline) {
                try {
                    // Obtener mensaje de alerta
                    const alertData = await getFormAlertMessage(formId);
                    console.log('📥 [FormatScreen] Datos de alerta recibidos:', JSON.stringify(alertData, null, 2));
                    if (alertData.has_alert && alertData.alert_message) {
                        console.log(`⚠️ [FormatScreen] Mensaje de alerta: "${alertData.alert_message}"`);
                        setAlertMessage(alertData.alert_message);
                        setShowAlertModal(true);
                    } else {
                        console.log('ℹ️ [FormatScreen] No hay mensaje de alerta para este formulario');
                    }
                } catch (error) {
                    console.error('⚠️ Error cargando mensaje de alerta:', error);
                    // No bloquear si falla la carga de alerta
                }

                try {
                    // Obtener instructivos
                    const instructivosData = await getFormInstructivos(formId);
                    if (instructivosData.instructivos && instructivosData.instructivos.length > 0) {
                        setInstructivos(instructivosData.instructivos);
                        console.log(`📚 [FormatScreen] ${instructivosData.count} instructivos cargados`);
                    }
                } catch (error) {
                    console.error('⚠️ Error cargando instructivos:', error);
                    // No bloquear si falla la carga de instructivos
                }
            }

        } catch (error: any) {
            console.error('❌ [FormatScreen] Error cargando formulario:', error);

            // ✅ Manejo especial para formularios que no existen (404)
            if (error?.message?.startsWith('FORM_NOT_FOUND:')) {
                Alert.alert(
                    'Formulario No Disponible',
                    `El formulario ${formId} no existe o fue eliminado del sistema.`,
                    [
                        {
                            text: 'Volver',
                            onPress: () => router.replace('/home')
                        }
                    ]
                );
                return;
            }

            Alert.alert(
                'Error al cargar formulario',
                error.message || 'No se pudieron obtener los datos del formulario',
                [
                    {
                        text: 'Reintentar',
                        onPress: () => loadFormData()
                    },
                    {
                        text: 'Volver',
                        onPress: () => router.replace('/home'),
                        style: 'cancel'
                    }
                ]
            );
        } finally {
            setLoading(false);
        }
    }, [formId]);

    /**
     * Refresca los datos del formulario (solo en modo online)
     */
    const handleRefresh = useCallback(async () => {
        if (!isOnline) {
            Alert.alert(
                'Sin conexión',
                'No se puede actualizar el formulario en modo offline. Conéctate a internet e intenta de nuevo.',
                [{ text: 'OK' }]
            );
            return;
        }

        try {
            setRefreshing(true);
            console.log(`🔄 [FormatScreen] Refrescando formulario ${formId}...`);

            await loadFormData();

            Alert.alert(
                'Actualizado',
                'El formulario se ha actualizado correctamente.',
                [{ text: 'OK' }]
            );
        } catch (error: any) {
            Alert.alert(
                'Error al actualizar',
                error.message || 'No se pudo actualizar el formulario',
                [{ text: 'OK' }]
            );
        } finally {
            setRefreshing(false);
        }
    }, [formId, isOnline, loadFormData]);

    /**
     * Maneja el botón de volver con confirmación
     */
    const handleGoBack = useCallback(() => {
        console.log('🔙 [FormatScreen] Botón volver presionado');

        if (Object.keys(formValues).length > 0) {
            console.log('⚠️ [FormatScreen] Hay cambios sin guardar, mostrando confirmación');
            Alert.alert(
                'Descartar cambios',
                '¿Estás seguro de que quieres salir? Los cambios no guardados se perderán.',
                [
                    {
                        text: 'Cancelar',
                        style: 'cancel'
                    },
                    {
                        text: 'Salir',
                        style: 'destructive',
                        onPress: () => {
                            console.log('✅ [FormatScreen] Navegando inmediatamente...');
                            setImmediate(() => router.replace('/home'));
                        }
                    }
                ]
            );
        } else {
            console.log('✅ [FormatScreen] No hay cambios, navegando inmediatamente...');
            setImmediate(() => router.replace('/home'));
        }
    }, [formValues, router]);

    /**
     * Maneja cambios en campos del formulario
     */
    const handleFieldChange = useCallback((fieldId: string, value: any) => {
        setFormValues(prev => ({
            ...prev,
            [fieldId]: value
        }));

        // Limpiar error del campo si existe
        if (errors[fieldId]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[fieldId];
                return newErrors;
            });
        }
    }, [errors]);

    /**
     * Envía el formulario (2 pasos como en PC)
     * Con soporte automático offline/online
     */
    const handleSubmit = useCallback(async (action: 'send' | 'send_and_close' = 'send') => {
        try {
            setSubmitting(true);
            console.log(`🚀 [FormatScreen] Enviando formulario (${action})...`);

            if (!formData) {
                throw new Error('No hay datos del formulario');
            }

            // Enviar usando ResponseAdapter (con detección automática offline)
            const result = await submitFormResponses(
                formId,
                formValues,
                formData.formStructure,
                action,
                isOnline
            );

            if (result.savedOffline) {
                console.log(`💾 [FormatScreen] Formulario guardado offline`);

                Alert.alert(
                    'Guardado Offline',
                    result.message,
                    [
                        {
                            text: 'Ver Pendientes',
                            onPress: () => router.replace('/pending-forms')
                        },
                        {
                            text: 'Aceptar',
                            onPress: () => router.replace('/home')
                        }
                    ]
                );
            } else {
                console.log(`✅ [FormatScreen] Formulario enviado exitosamente`);
                console.log(`📝 [FormatScreen] Response ID: ${result.response_id}`);

                Alert.alert(
                    'Éxito',
                    result.message,
                    [
                        {
                            text: 'Aceptar',
                            onPress: () => router.replace('/home')
                        }
                    ]
                );
            }

        } catch (error: any) {
            console.error('❌ [FormatScreen] Error enviando formulario:', error);

            const errorMessage = error.message || 'Error desconocido al enviar el formulario';

            Alert.alert(
                'Error al enviar',
                errorMessage,
                [{ text: 'Aceptar' }]
            );
        } finally {
            setSubmitting(false);
        }
    }, [formId, formData, formValues, isOnline, router]);

    /**
     * Maneja el botón back de Android
     */
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                if (Object.keys(formValues).length > 0) {
                    Alert.alert(
                        'Descartar cambios',
                        '¿Estás seguro de que quieres salir? Los cambios no guardados se perderán.',
                        [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                                text: 'Salir',
                                style: 'destructive',
                                onPress: () => setImmediate(() => router.replace('/home'))
                            }
                        ]
                    );
                    return true;
                }
                // Si no hay cambios, permitir navegación nativa
                return false;
            };

            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => subscription.remove();
        }, [formValues, router])
    );

    /**
     * Monitorear estado de conexión
     */
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(state.isConnected ?? false);
        });

        return () => unsubscribe();
    }, []);

    /**
     * Cargar datos al montar
     */
    useEffect(() => {
        loadFormData();
    }, [loadFormData]);

    // ============ RENDER ============

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#12A0AF" />
                <Text style={styles.loadingText}>Cargando formulario...</Text>
                {!isOnline && (
                    <Text style={styles.offlineText}>📡 Modo Offline</Text>
                )}
            </View>
        );
    }

    if (!formData) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>No se pudo cargar el formulario</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadFormData}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Indicador de conexión */}
            <ConnectionIndicator />

            {/* Header con título prominente y responsive */}
            <LinearGradient
                colors={['#1e3a8a', '#3b82f6', '#60a5fa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Barra superior con botones */}
                <View style={styles.topBar}>
                    <TouchableOpacity
                        onPress={handleGoBack}
                        style={styles.backButton}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <HomeIcon size={24} color="white" />
                        <Text style={styles.backButtonText}>Volver</Text>
                    </TouchableOpacity>

                    <View style={styles.actionsBar}>
                        {/* Botón de actualizar */}
                        <TouchableOpacity
                            onPress={handleRefresh}
                            style={[styles.refreshButton, (!isOnline || refreshing) && styles.refreshButtonDisabled]}
                            disabled={!isOnline || refreshing}
                        >
                            <Text style={styles.refreshIcon}>
                                {refreshing ? '⏳' : '🔄'}
                            </Text>
                        </TouchableOpacity>

                        {/* Indicador de estado */}
                        <View style={styles.statusContainer}>
                            <View style={[styles.statusDot, isOnline ? styles.statusOnline : styles.statusOffline]} />
                            <Text style={styles.statusText}>
                                {isOnline ? 'Online' : 'Offline'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Título y descripción - Arriba de todo, responsive */}
                <View style={styles.titleSection}>
                    <Text style={styles.headerTitle}>
                        {formData.metadata.title}
                    </Text>
                    {formData.metadata.description && (
                        <Text style={styles.headerSubtitle}>
                            {formData.metadata.description}
                        </Text>
                    )}
                </View>

                {/* Última sincronización */}
                {lastSync && (
                    <View style={styles.syncInfo}>
                        <Text style={styles.syncText}>
                            Última sync: {lastSync.toLocaleTimeString()}
                        </Text>
                    </View>
                )}
            </LinearGradient>

            {/* 🆕 Sección de instructivos (solo si hay archivos y alerta fue aceptada o no hay alerta) */}
            {instructivos.length > 0 && (alertMessage ? alertAccepted : true) && (
                <InstructivosSection instructivos={instructivos} />
            )}

            {/* Formulario (solo si alerta fue aceptada o no hay alerta) */}
            {(alertMessage ? alertAccepted : true) && (
                <FormRenderer
                    formStructure={formData.formStructure}
                    values={formValues}
                    onChange={handleFieldChange}
                    errors={errors}
                    styleConfig={formData.styleConfig}
                    correlations={formData.correlations}
                    disabled={submitting}
                />
            )}

            {/* 🆕 Modal de alerta (se muestra antes de permitir diligenciar) */}
            {alertMessage && (
                <AlertMessageModal
                    visible={showAlertModal}
                    message={alertMessage}
                    onAccept={() => {
                        setShowAlertModal(false);
                        setAlertAccepted(true);
                    }}
                    onCancel={() => {
                        setShowAlertModal(false);
                        router.replace('/home');
                    }}
                />
            )}

            {/* Botones de acción */}
            <View style={styles.actionsContainer}>
                <TouchableOpacity
                    style={[styles.actionButton, styles.saveButton]}
                    onPress={() => handleSubmit('send')}
                    disabled={submitting}
                >
                    <Text style={styles.actionButtonText}>
                        {submitting ? 'Guardando...' : (isOnline ? 'Guardar' : 'Guardar Offline')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionButton, styles.sendButton]}
                    onPress={() => handleSubmit('send_and_close')}
                    disabled={submitting}
                >
                    <Text style={styles.actionButtonText}>
                        {submitting ? 'Enviando...' : (isOnline ? 'Enviar y Cerrar' : 'Guardar Offline y Cerrar')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const { width: screenWidth } = Dimensions.get('window');
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 768;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6'
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6'
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#6B7280'
    },
    offlineText: {
        marginTop: 8,
        fontSize: 14,
        color: '#F59E0B'
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        padding: 24
    },
    errorText: {
        fontSize: 16,
        color: '#EF4444',
        textAlign: 'center',
        marginBottom: 16
    },
    retryButton: {
        backgroundColor: '#12A0AF',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8
    },
    retryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600'
    },
    header: {
        paddingTop: isSmallScreen ? 44 : 48,
        paddingBottom: 20,
        paddingHorizontal: isSmallScreen ? 12 : 16
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        zIndex: 999
    },
    actionsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    backButton: {
        flexDirection: 'row',
        padding: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5
    },
    backButtonText: {
        color: '#FFFFFF',
        marginLeft: 8,
        fontSize: 14,
        fontWeight: '600'
    },
    refreshButton: {
        padding: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderRadius: 8,
        minWidth: 40,
        alignItems: 'center',
        justifyContent: 'center'
    },
    refreshButtonDisabled: {
        opacity: 0.4
    },
    refreshIcon: {
        fontSize: 20
    },
    titleSection: {
        width: '100%',
        paddingVertical: 12,
        paddingHorizontal: 4
    },
    headerTitle: {
        fontSize: isSmallScreen ? 20 : isMediumScreen ? 24 : 28,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 6,
        lineHeight: isSmallScreen ? 26 : isMediumScreen ? 32 : 36,
        flexWrap: 'wrap',
        textAlign: 'left'
    },
    headerSubtitle: {
        fontSize: isSmallScreen ? 13 : 15,
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: isSmallScreen ? 18 : 22,
        flexWrap: 'wrap',
        textAlign: 'left'
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 4
    },
    statusOnline: {
        backgroundColor: '#10B981'
    },
    statusOffline: {
        backgroundColor: '#F59E0B'
    },
    statusText: {
        fontSize: 12,
        color: '#FFFFFF',
        fontWeight: '600'
    },
    syncInfo: {
        marginTop: 4
    },
    syncText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.7)'
    },
    scrollView: {
        flex: 1
    },
    scrollContent: {
        padding: 16
    },
    debugInfo: {
        marginTop: 24,
        padding: 12,
        backgroundColor: '#FEF3C7',
        borderRadius: 8
    },
    debugText: {
        fontSize: 12,
        color: '#92400E'
    },
    actionsContainer: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB'
    },
    actionButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginHorizontal: 4
    },
    saveButton: {
        backgroundColor: '#6B7280'
    },
    sendButton: {
        backgroundColor: '#12A0AF'
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600'
    }
});
