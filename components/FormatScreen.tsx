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
    Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';

// Nuevos imports
import { syncFormData, getSyncStatus } from '../utils/FormSyncManager';
import { submitFormResponses } from '../utils/ResponseAdapter';
import { EnrichedFormData } from '../utils/FormDataAdapter';
import FormRenderer from './FormRenderer/FormRenderer';
import { CircleInfoIcon, HomeIcon } from './Icons';

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

    /**
     * Carga datos del formulario (online/offline automático)
     */
    const loadFormData = useCallback(async () => {
        try {
            setLoading(true);
            console.log(`📋 [FormatScreen] Cargando formulario ${formId}...`);

            // Obtener estado de sincronización
            const syncStatus = await getSyncStatus(formId);
            setIsOnline(syncStatus.isOnline);
            setLastSync(syncStatus.lastSync);

            console.log(`📡 [FormatScreen] Estado: ${syncStatus.isOnline ? 'ONLINE' : 'OFFLINE'}`);
            console.log(`💾 [FormatScreen] Datos locales: ${syncStatus.hasLocalData ? 'SÍ' : 'NO'}`);

            // Sincronizar datos (usa AsyncStorage si está offline)
            const enrichedData = await syncFormData(formId);

            setFormData(enrichedData);
            setFormValues({});
            setErrors({});

            console.log(`✅ [FormatScreen] Formulario cargado: ${enrichedData.metadata.title}`);
            console.log(`📊 [FormatScreen] ${enrichedData.formStructure.length} elementos en estructura`);

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
        if (Object.keys(formValues).length > 0) {
            Alert.alert(
                'Descartar cambios',
                '¿Estás seguro de que quieres salir? Los cambios no guardados se perderán.',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Salir',
                        style: 'destructive',
                        onPress: () => router.replace('/home')
                    }
                ]
            );
        } else {
            router.replace('/home');
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
                                onPress: () => router.replace('/home')
                            }
                        ]
                    );
                    return true;
                }
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
            {/* Header */}
            <LinearGradient
                colors={['#1e3a8a', '#3b82f6', '#60a5fa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                <View style={styles.headerContent}>
                    <TouchableOpacity
                        onPress={handleGoBack}
                        style={styles.backButton}
                    >
                        <CircleInfoIcon width={24} height={24} color="#FFFFFFFF" />

                        <Text style={{ color: '#FFFFFFFF', marginLeft: 0,marginTop: 8, borderColor: 'white' }}>Back</Text>
                    </TouchableOpacity>

                    <View style={styles.titleContainer}>
                        <Text style={styles.headerTitle} numberOfLines={2}>
                            {formData.metadata.title}
                        </Text>
                        {formData.metadata.description && (
                            <Text style={styles.headerSubtitle} numberOfLines={1}>
                                {formData.metadata.description}
                            </Text>
                        )}
                    </View>

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

                {/* Última sincronización */}
                {lastSync && (
                    <View style={styles.syncInfo}>
                        <Text style={styles.syncText}>
                            Última sync: {lastSync.toLocaleTimeString()}
                        </Text>
                    </View>
                )}
            </LinearGradient>

            {/* Formulario con FlatList (NO ScrollView para evitar anidación) */}
            <FormRenderer
                formStructure={formData.formStructure}
                values={formValues}
                onChange={handleFieldChange}
                errors={errors}
                styleConfig={formData.styleConfig}
                correlations={formData.correlations}
                disabled={submitting}
            />

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
        paddingTop: 48,
        paddingBottom: 16,
        paddingHorizontal: 15
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8
    },
    backButton: {
        padding: 15
    },
    refreshButton: {
        padding: 8,
        marginRight: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 8
    },
    refreshButtonDisabled: {
        opacity: 0.4
    },
    refreshIcon: {
        fontSize: 20
    },
    titleContainer: {
        flex: 1,
        marginLeft: 12
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF'
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: 2
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 4,
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
