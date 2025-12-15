/**
 * InstructivosSection.tsx
 * Sección para mostrar archivos de ayuda/instructivos del formulario
 */

import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    Linking,
    Platform,
    ActivityIndicator
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { createDownloadResumable, documentDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Instructivo {
    url: string;
    description: string;
    original_name: string;
    file_type: string;
    size: number;
}

interface InstructivosSectionProps {
    instructivos: Instructivo[];
}

interface DownloadProgress {
    url: string;
    progress: number;
    totalBytes: number;
    writtenBytes: number;
}

export const InstructivosSection: React.FC<InstructivosSectionProps> = ({ instructivos }) => {
    const [expanded, setExpanded] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
    const downloadResumableRef = useRef<any>(null);

    if (!instructivos || instructivos.length === 0) {
        return null;
    }

    /**
     * Obtiene el icono según el tipo de archivo
     */
    const getFileIcon = (fileType: string): any => {
        if (fileType.includes('pdf')) return 'picture-as-pdf';
        if (fileType.includes('image')) return 'image';
        if (fileType.includes('video')) return 'video-library';
        if (fileType.includes('word') || fileType.includes('document')) return 'description';
        if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'table-chart';
        return 'insert-drive-file';
    };

    /**
     * Formatea el tamaño del archivo
     */
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    /**
     * Cancela la descarga en curso
     */
    const handleCancelDownload = async () => {
        if (downloadResumableRef.current) {
            try {
                await downloadResumableRef.current.pauseAsync();
                downloadResumableRef.current = null;
                setDownloading(null);
                setDownloadProgress(null);
                console.log('🚫 Descarga cancelada');
                Alert.alert('Cancelado', 'La descarga ha sido cancelada.', [{ text: 'OK' }]);
            } catch (error) {
                console.error('Error al cancelar descarga:', error);
            }
        }
    };

    /**
     * Maneja la descarga del archivo con progreso
     */
    const handleDownload = async (instructivo: Instructivo) => {
        try {
            setDownloading(instructivo.url);
            setDownloadProgress({
                url: instructivo.url,
                progress: 0,
                totalBytes: instructivo.size || 0,
                writtenBytes: 0
            });

            console.log('📥 Iniciando descarga:', instructivo.original_name);
            const startTime = Date.now();

            // Crear nombre de archivo para guardar
            const fileName = instructivo.original_name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileUri = `${documentDirectory}${fileName}`;

            // Obtener token para headers
            const token = await AsyncStorage.getItem('authToken');
            const downloadUrl = await getDownloadUrl(instructivo.url);

            console.log('📡 Descargando desde:', downloadUrl);
            console.log('🔑 Token presente:', token ? 'Sí' : 'No');
            console.log('💾 Guardando en:', fileUri);

            // Crear descarga resumible con callback de progreso
            const downloadResumable = createDownloadResumable(
                downloadUrl,
                fileUri,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                },
                (downloadProgressData) => {
                    console.log('🔄 Callback de progreso llamado:', {
                        written: downloadProgressData.totalBytesWritten,
                        expected: downloadProgressData.totalBytesExpectedToWrite
                    });

                    const progress = downloadProgressData.totalBytesWritten / downloadProgressData.totalBytesExpectedToWrite;
                    const percent = Math.round(progress * 100);

                    setDownloadProgress({
                        url: instructivo.url,
                        progress: percent,
                        totalBytes: downloadProgressData.totalBytesExpectedToWrite,
                        writtenBytes: downloadProgressData.totalBytesWritten
                    });

                    console.log(`📊 Progreso: ${percent}% (${formatFileSize(downloadProgressData.totalBytesWritten)} / ${formatFileSize(downloadProgressData.totalBytesExpectedToWrite)})`);
                }
            );

            // Guardar referencia para poder cancelar
            downloadResumableRef.current = downloadResumable;

            console.log('⏳ Esperando respuesta del servidor...');

            // Crear timeout de 30 segundos
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout: La descarga tardó más de 30 segundos')), 30000);
            });

            // Iniciar descarga con timeout
            const result = await Promise.race([
                downloadResumable.downloadAsync(),
                timeoutPromise
            ]) as any;

            console.log('✅ Respuesta del servidor recibida:', result?.status);

            if (!result || result.status !== 200) {
                throw new Error(`Error en la descarga: HTTP ${result?.status || 'desconocido'}`);
            }

            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(1);
            console.log(`✅ Descarga completada en ${duration}s`);
            console.log('📁 Archivo guardado en:', result.uri);

            // Limpiar referencia
            downloadResumableRef.current = null;

            // Intentar compartir el archivo para que el usuario pueda abrirlo
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(result.uri, {
                    mimeType: instructivo.file_type || 'application/octet-stream',
                    dialogTitle: 'Abrir archivo con...',
                });

                Alert.alert(
                    '✅ Descargado',
                    `El archivo "${instructivo.original_name}" se ha descargado correctamente en ${duration}s.`,
                    [{ text: 'OK' }]
                );
            } else {
                Alert.alert(
                    '✅ Descargado',
                    `Archivo guardado en:\n${result.uri}`,
                    [{ text: 'OK' }]
                );
            }

        } catch (error: any) {
            console.error('❌ Error descargando instructivo:', error);

            // Limpiar referencia
            downloadResumableRef.current = null;

            Alert.alert(
                'Error al descargar',
                `No se pudo descargar "${instructivo.original_name}".\n\n${error.message || 'Por favor intenta de nuevo.'}`,
                [{ text: 'OK' }]
            );
        } finally {
            setDownloading(null);
            setDownloadProgress(null);
        }
    };

    /**
     * Obtiene la URL de descarga completa
     * Envía la ruta tal cual viene de la BD, el backend se encarga de normalizarla
     */
    const getDownloadUrl = async (filePath: string): Promise<string> => {
        const backendUrl = await AsyncStorage.getItem('backend_url') || 'https://api-forms-sfi.service.saferut.com';

        // Enviar la ruta EXACTAMENTE como viene de la base de datos
        // El backend hará replace('\\', '/') y os.path.exists()
        console.log('📂 Ruta enviada (sin modificar):', filePath);

        // Construir URL con la ruta exacta
        const baseUrl = `${backendUrl}/forms/files/download-instructivo?file_path=${encodeURIComponent(filePath)}`;

        console.log('🔗 URL completa:', baseUrl);
        return baseUrl;
    };

    return (
        <View style={styles.container}>
            {/* Header colapsable */}
            <TouchableOpacity
                style={styles.header}
                onPress={() => setExpanded(!expanded)}
                activeOpacity={0.7}
            >
                <View style={styles.headerLeft}>
                    <MaterialIcons name="help-outline" size={24} color="#4B34C7" />
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.headerTitle}>Archivos de Ayuda</Text>
                        <Text style={styles.headerSubtitle}>
                            {instructivos.length} {instructivos.length === 1 ? 'archivo' : 'archivos'}
                        </Text>
                    </View>
                </View>
                <MaterialIcons
                    name={expanded ? 'expand-less' : 'expand-more'}
                    size={24}
                    color="#666"
                />
            </TouchableOpacity>

            {/* Lista de instructivos */}
            {expanded && (
                <View style={styles.content}>
                    {instructivos.map((instructivo, index) => {
                        const isDownloading = downloading === instructivo.url;
                        const progress = downloadProgress?.url === instructivo.url ? downloadProgress : null;

                        return (
                            <View key={index} style={styles.instructivoItem}>
                                <TouchableOpacity
                                    style={styles.instructivoTouchable}
                                    onPress={() => !isDownloading && handleDownload(instructivo)}
                                    disabled={isDownloading}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.instructivoLeft}>
                                        <MaterialIcons
                                            name={getFileIcon(instructivo.file_type)}
                                            size={32}
                                            color={isDownloading ? "#999" : "#4B34C7"}
                                        />
                                        <View style={styles.instructivoInfo}>
                                            <Text style={styles.instructivoName} numberOfLines={1}>
                                                {instructivo.original_name}
                                            </Text>
                                            <Text style={styles.instructivoDescription} numberOfLines={2}>
                                                {instructivo.description}
                                            </Text>
                                            <Text style={styles.instructivoSize}>
                                                {formatFileSize(instructivo.size)}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.instructivoRight}>
                                        {isDownloading ? (
                                            <ActivityIndicator size="small" color="#4B34C7" />
                                        ) : (
                                            <MaterialIcons name="download" size={24} color="#4B34C7" />
                                        )}
                                    </View>
                                </TouchableOpacity>

                                {/* Barra de progreso */}
                                {isDownloading && progress && (
                                    <View style={styles.progressContainer}>
                                        <View style={styles.progressBar}>
                                            <View style={[styles.progressFill, { width: `${progress.progress}%` }]} />
                                        </View>
                                        <View style={styles.progressInfo}>
                                            <Text style={styles.progressText}>
                                                {progress.progress}% - {formatFileSize(progress.writtenBytes)} / {formatFileSize(progress.totalBytes)}
                                            </Text>
                                            <TouchableOpacity
                                                onPress={handleCancelDownload}
                                                style={styles.cancelButton}
                                            >
                                                <MaterialIcons name="close" size={18} color="#EF4444" />
                                                <Text style={styles.cancelText}>Cancelar</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginHorizontal: 16,
        marginVertical: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerTextContainer: {
        marginLeft: 12,
        flex: 1,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    content: {
        padding: 8,
    },
    instructivoItem: {
        backgroundColor: '#fafafa',
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
    },
    instructivoTouchable: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
    },
    instructivoLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    instructivoInfo: {
        marginLeft: 12,
        flex: 1,
    },
    instructivoName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    instructivoDescription: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    instructivoSize: {
        fontSize: 11,
        color: '#999',
    },
    instructivoRight: {
        marginLeft: 12,
    },
    progressContainer: {
        paddingHorizontal: 12,
        paddingBottom: 12,
        paddingTop: 4,
    },
    progressBar: {
        height: 6,
        backgroundColor: '#e0e0e0',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#4B34C7',
        borderRadius: 3,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    progressText: {
        fontSize: 11,
        color: '#666',
        flex: 1,
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        backgroundColor: '#fee',
        borderRadius: 4,
        marginLeft: 8,
    },
    cancelText: {
        fontSize: 11,
        color: '#EF4444',
        fontWeight: '600',
        marginLeft: 4,
    },
});
