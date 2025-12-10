// Stubs para campos que se implementarán completamente después
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import InputField from './InputField';
import DateTimePicker from '@react-native-community/datetimepicker';
import FacialRecognitionWebView from '../../FacialRecognitionWebView';

// DateField
export const DateField: React.FC<any> = ({ label, required, value, onChange, error, disabled, mode = 'date' }) => {
    const [show, setShow] = React.useState(false);
    const [date, setDate] = React.useState(value ? new Date(value) : new Date());

    const handleChange = (event: any, selectedDate?: Date) => {
        setShow(Platform.OS === 'ios');
        if (selectedDate) {
            setDate(selectedDate);
            const formatted = mode === 'datetime'
                ? selectedDate.toISOString()
                : selectedDate.toISOString().split('T')[0];
            onChange(formatted);
        }
    };

    return (
        <View style={styles.container}>
            {label && (
                <Text style={styles.label}>
                    {label}
                    {required && <Text style={styles.required}> *</Text>}
                </Text>
            )}
            <TouchableOpacity
                style={[styles.dateButton, error && styles.dateButtonError]}
                onPress={() => !disabled && setShow(true)}
                disabled={disabled}
            >
                <Text style={styles.dateText}>
                    {value || 'Seleccionar fecha'}
                </Text>
            </TouchableOpacity>
            {show && (
                <DateTimePicker
                    value={date}
                    mode={mode as any}
                    onChange={handleChange}
                />
            )}
            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
};

// TimeField
export const TimeField: React.FC<any> = (props) => <DateField {...props} mode="time" />;

// NumberField
export const NumberField: React.FC<any> = (props) => (
    <InputField {...props} keyboardType="numeric" />
);

// CheckboxField
export const CheckboxField: React.FC<any> = ({ label, required, value, onChange, error, disabled }) => (
    <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => !disabled && onChange(!value)}
        disabled={disabled}
    >
        <View style={[styles.checkbox, value && styles.checkboxChecked]}>
            {value && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
            {label}
            {required && <Text style={styles.required}> *</Text>}
        </Text>
    </TouchableOpacity>
);

// RadioField
export const RadioField: React.FC<any> = ({ label, options = [], required, value, onChange, error, disabled }) => (
    <View style={styles.container}>
        {label && (
            <Text style={styles.label}>
                {label}
                {required && <Text style={styles.required}> *</Text>}
            </Text>
        )}
        {options.map((option: string, index: number) => (
            <TouchableOpacity
                key={index}
                style={styles.radioContainer}
                onPress={() => !disabled && onChange(option)}
                disabled={disabled}
            >
                <View style={[styles.radio, value === option && styles.radioSelected]}>
                    {value === option && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioLabel}>{option}</Text>
            </TouchableOpacity>
        ))}
        {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
);

// FileField - Selector de archivos con DocumentPicker
export const FileField: React.FC<any> = ({ label, required, value, onChange, error, disabled }) => {
    const [fileName, setFileName] = React.useState(value || '');
    const [uploading, setUploading] = React.useState(false);

    const pickDocument = async () => {
        if (disabled) return;

        try {
            // Importar dinámicamente expo-document-picker
            const DocumentPicker = require('expo-document-picker');

            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true
            });

            if (result.type === 'success' || !result.canceled) {
                const file = result.assets ? result.assets[0] : result;
                setFileName(file.name);

                // Aquí podrías subir el archivo al servidor
                // Por ahora solo guardamos el nombre
                onChange && onChange({
                    name: file.name,
                    uri: file.uri,
                    size: file.size,
                    mimeType: file.mimeType
                });
            }
        } catch (err) {
            console.error('Error al seleccionar archivo:', err);
            Alert.alert('Error', 'No se pudo seleccionar el archivo');
        }
    };

    const clearFile = () => {
        setFileName('');
        onChange && onChange(null);
    };

    return (
        <View style={styles.container}>
            {label && (
                <Text style={styles.label}>
                    {label}
                    {required && <Text style={styles.required}> *</Text>}
                </Text>
            )}

            {fileName ? (
                <View style={styles.fileSelected}>
                    <View style={styles.fileInfo}>
                        <Text style={styles.fileIcon}>📎</Text>
                        <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
                    </View>
                    <TouchableOpacity onPress={clearFile} style={styles.fileClearButton}>
                        <Text style={styles.fileClearText}>✕</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity
                    style={[styles.fileButton, error && styles.fileButtonError]}
                    onPress={pickDocument}
                    disabled={disabled || uploading}
                >
                    <Text style={styles.fileIcon}>📁</Text>
                    <Text style={styles.fileButtonText}>
                        {uploading ? 'Subiendo...' : 'Seleccionar archivo'}
                    </Text>
                </TouchableOpacity>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
};

// LocationField - Campo de ubicación GPS con geolocalización
export const LocationField: React.FC<any> = ({
    label,
    placeholder = 'Presiona el botón GPS para obtener ubicación',
    required,
    value,
    onChange,
    error,
    disabled,
    allowCurrentLocation = true
}) => {
    const [location, setLocation] = React.useState(value || '');
    const [loading, setLoading] = React.useState(false);

    const getCurrentLocation = async () => {
        if (disabled) return;

        try {
            setLoading(true);

            // Importar dinámicamente expo-location
            const Location = require('expo-location');

            // Pedir permisos
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Permiso denegado',
                    'Se necesita acceso a la ubicación para usar esta función'
                );
                setLoading(false);
                return;
            }

            // Obtener ubicación con alta precisión
            const position = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High
            });

            const { latitude, longitude } = position.coords;
            const locationString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

            setLocation(locationString);
            onChange && onChange(locationString);

        } catch (err) {
            console.error('Error obteniendo ubicación:', err);
            Alert.alert(
                'Error',
                'No se pudo obtener la ubicación. Verifica que el GPS esté activado.'
            );
        } finally {
            setLoading(false);
        }
    };

    const clearLocation = () => {
        setLocation('');
        onChange && onChange('');
    };

    return (
        <View style={styles.container}>
            {label && (
                <Text style={styles.label}>
                    {label}
                    {required && <Text style={styles.required}> *</Text>}
                </Text>
            )}

            <View style={styles.locationContainer}>
                <View style={[styles.locationInput, error && styles.locationInputError]}>
                    <Text style={styles.locationIcon}>📍</Text>
                    <Text style={[styles.locationText, !location && styles.locationPlaceholder]}>
                        {location || placeholder}
                    </Text>
                </View>

                {allowCurrentLocation && (
                    <View style={styles.locationButtons}>
                        <TouchableOpacity
                            style={[styles.gpsButton, loading && styles.gpsButtonLoading]}
                            onPress={getCurrentLocation}
                            disabled={disabled || loading}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Text style={styles.gpsButtonText}>📡 GPS</Text>
                            )}
                        </TouchableOpacity>

                        {location && (
                            <TouchableOpacity
                                style={styles.clearLocationButton}
                                onPress={clearLocation}
                                disabled={disabled}
                            >
                                <Text style={styles.clearLocationText}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
};

// FirmField - Wrapper del componente existente
export const FirmField: React.FC<any> = (props) => {
    const ExistingFirmField = require('../../FirmField').default;
    return <ExistingFirmField {...props} />;
};

// FacialField - Reconocimiento facial biométrico usando WebView (misma librería que PC)
export const FacialField: React.FC<any> = ({
    label,
    required,
    value,
    onChange,
    error,
    disabled,
    mode = 'register', // 'register', 'validate', 'sign'
    personId,
    personName,
    documentHash
}) => {
    const [showWebView, setShowWebView] = React.useState(false);
    const [facialData, setFacialData] = React.useState(value || null);

    const handleOpenFacial = () => {
        console.log('🔓 Abriendo reconocimiento facial:', { mode, personId, personName });
        if (disabled) return;
        setShowWebView(true);
    };

    const handleSuccess = (data: any) => {
        console.log('✅ Reconocimiento facial exitoso:', data);
        setFacialData(data);
        onChange && onChange(data);
        setShowWebView(false);
    };

    const handleError = (error: any) => {
        console.error('❌ Error en reconocimiento facial:', error);
        Alert.alert(
            'Error',
            error?.message || 'No se pudo completar el reconocimiento facial'
        );
        setShowWebView(false);
    };

    const handleCancel = () => {
        console.log('❌ Reconocimiento facial cancelado');
        setShowWebView(false);
    };

    const clearFacialData = () => {
        setFacialData(null);
        onChange && onChange(null);
    };

    return (
        <View style={styles.container}>
            {label && (
                <Text style={styles.label}>
                    {label}
                    {required && <Text style={styles.required}> *</Text>}
                </Text>
            )}

            {facialData ? (
                <View style={styles.facialSuccess}>
                    <Text style={styles.facialSuccessIcon}>✓</Text>
                    <View style={styles.facialSuccessInfo}>
                        <Text style={styles.facialSuccessText}>Reconocimiento completado</Text>
                        <Text style={styles.facialSuccessDetail}>
                            {facialData.personName && `Usuario: ${facialData.personName}`}
                            {facialData.timestamp && `\n${new Date(facialData.timestamp).toLocaleString()}`}
                            {facialData.confidence_score && `\nConfianza: ${(facialData.confidence_score * 100).toFixed(1)}%`}
                        </Text>
                    </View>
                    {!disabled && (
                        <TouchableOpacity onPress={clearFacialData} style={styles.facialClearButton}>
                            <Text style={styles.facialClearText}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <TouchableOpacity
                    style={[styles.facialButton, error && styles.facialButtonError]}
                    onPress={handleOpenFacial}
                    disabled={disabled}
                >
                    <Text style={styles.facialButtonIcon}>🔒</Text>
                    <Text style={styles.facialButtonText}>
                        {mode === 'register' && 'Registrar rostro'}
                        {mode === 'validate' && 'Validar identidad'}
                        {mode === 'sign' && 'Firmar con rostro'}
                    </Text>
                </TouchableOpacity>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            {/* WebView Modal para reconocimiento facial */}
            {showWebView && (
                <FacialRecognitionWebView
                    visible={showWebView}
                    mode={mode}
                    personId={personId}
                    personName={personName}
                    documentHash={documentHash}
                    onSuccess={handleSuccess}
                    onError={handleError}
                    onCancel={handleCancel}
                />
            )}
        </View>
    );
};

// RepeaterField - Renderiza tabla dinámica con filas repetibles (lógica 100% PC)
export const RepeaterField: React.FC<any> = ({
    label,
    value = [],
    onChange,
    children = [],
    renderItem,
    minItems = 1,
    maxItems = 100,
    addButtonText = 'Agregar fila',
    disabled
}) => {
    // Estado de filas - cada fila tiene id único y valores de campos
    const [rows, setRows] = React.useState<Array<{ id: string; values: Record<string, any> }>>(() => {
        // Inicializar con minItems filas vacías o valores existentes
        if (value && value.length > 0) {
            return value.map((rowValues: any, index: number) => ({
                id: `row-${index}-${Date.now()}`,
                values: rowValues
            }));
        }
        // Crear filas vacías iniciales
        return Array.from({ length: Math.max(minItems, 1) }, (_, index) => ({
            id: `row-${index}-${Date.now()}`,
            values: {}
        }));
    });

    // Crear fila vacía con valores por defecto
    const createEmptyRow = () => {
        const emptyValues: Record<string, any> = {};
        children.forEach((child: any) => {
            switch (child.type) {
                case 'checkbox':
                    emptyValues[child.id] = false;
                    break;
                case 'select':
                case 'radio':
                case 'number':
                case 'time':
                    emptyValues[child.id] = '';
                    break;
                default:
                    emptyValues[child.id] = '';
            }
        });
        return {
            id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            values: emptyValues
        };
    };

    // Agregar nueva fila
    const handleAddRow = () => {
        if (rows.length < maxItems && !disabled) {
            const newRow = createEmptyRow();
            const newRows = [...rows, newRow];
            setRows(newRows);
            // Notificar cambios al padre
            onChange && onChange(newRows.map(row => row.values));
        }
    };

    // Eliminar fila
    const handleRemoveRow = (rowId: string) => {
        if (rows.length > minItems && !disabled) {
            const newRows = rows.filter(row => row.id !== rowId);
            setRows(newRows);
            // Notificar cambios al padre
            onChange && onChange(newRows.map(row => row.values));
        }
    };

    // Actualizar valor de campo en fila específica
    const handleFieldChange = (rowId: string, fieldId: string, fieldValue: any) => {
        const newRows = rows.map(row => {
            if (row.id === rowId) {
                return {
                    ...row,
                    values: {
                        ...row.values,
                        [fieldId]: fieldValue
                    }
                };
            }
            return row;
        });
        setRows(newRows);
        // Notificar cambios al padre
        onChange && onChange(newRows.map(row => row.values));
    };

    return (
        <View style={styles.repeaterContainer}>
            {/* Header con título y botón agregar */}
            <View style={styles.repeaterHeader}>
                {label && <Text style={styles.repeaterLabel}>{label}</Text>}
                {!disabled && rows.length < maxItems && (
                    <TouchableOpacity
                        onPress={handleAddRow}
                        style={styles.addButton}
                    >
                        <Text style={styles.addButtonText}>+ {addButtonText}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Renderizar cada fila */}
            {rows.map((row, rowIndex) => (
                <View key={row.id} style={styles.repeaterRow}>
                    {/* Header de fila con número y botón eliminar */}
                    <View style={styles.rowHeader}>
                        <Text style={styles.rowNumber}>Fila {rowIndex + 1}</Text>
                        {!disabled && rows.length > minItems && (
                            <TouchableOpacity
                                onPress={() => handleRemoveRow(row.id)}
                                style={styles.removeButton}
                            >
                                <Text style={styles.removeButtonText}>✕ Eliminar</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Campos de la fila */}
                    <View style={styles.rowFields}>
                        {children.map((child: any) => {
                            if (!renderItem) return null;
                            // Crear una copia del child con el valor específico de esta fila
                            const childWithRowContext = {
                                ...child,
                                // Agregar sufijo al id para hacer único por fila
                                id: `${child.id}_${row.id}`,
                                // Props con onChange personalizado para esta fila
                                props: {
                                    ...child.props,
                                    value: row.values[child.id],
                                    onChange: (val: any) => handleFieldChange(row.id, child.id, val)
                                }
                            };
                            return (
                                <View key={`${row.id}-${child.id}`}>
                                    {renderItem(childWithRowContext)}
                                </View>
                            );
                        })}
                    </View>
                </View>
            ))}

            {/* Info de contador */}
            <Text style={styles.repeaterInfo}>
                {rows.length} fila{rows.length !== 1 ? 's' : ''}
                {minItems > 0 && ` (mínimo ${minItems})`}
                {maxItems < 100 && ` (máximo ${maxItems})`}
            </Text>
        </View>
    );
};// LayoutField - Renderiza hijos en vertical u horizontal
export const LayoutField: React.FC<any> = ({ type, children, renderItem }) => {
    const isHorizontal = type === 'horizontal-layout';
    return (
        <View style={[styles.layout, isHorizontal && styles.layoutHorizontal]}>
            {children?.map((child: any) => (
                <View key={child.id} style={isHorizontal && styles.layoutChild}>
                    {renderItem(child)}
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '500', marginBottom: 6, color: '#374151' },
    required: { color: '#EF4444' },
    errorText: { fontSize: 12, color: '#EF4444', marginTop: 4 },

    // Date
    dateButton: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, backgroundColor: '#FFF' },
    dateButtonError: { borderColor: '#EF4444' },
    dateText: { fontSize: 16, color: '#374151' },

    // Checkbox
    checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
    checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: '#D1D5DB', borderRadius: 4, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: '#12A0AF', borderColor: '#12A0AF' },
    checkmark: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    checkboxLabel: { fontSize: 16, color: '#374151' },

    // Radio
    radioContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
    radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', marginRight: 8, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: '#12A0AF' },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#12A0AF' },
    radioLabel: { fontSize: 16, color: '#374151' },

    // File
    fileButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 16,
        backgroundColor: '#F9FAFB'
    },
    fileButtonError: { borderColor: '#EF4444' },
    fileIcon: { fontSize: 24 },
    fileButtonText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
    fileSelected: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#DBEAFE',
        borderRadius: 8,
        padding: 12
    },
    fileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 8
    },
    fileName: {
        fontSize: 14,
        color: '#1E40AF',
        fontWeight: '500',
        flex: 1
    },
    fileClearButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center'
    },
    fileClearText: {
        color: '#DC2626',
        fontSize: 14,
        fontWeight: 'bold'
    },

    // Location
    locationContainer: {
        gap: 8
    },
    locationInput: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 12,
        gap: 8
    },
    locationInputError: {
        borderColor: '#EF4444'
    },
    locationIcon: {
        fontSize: 20
    },
    locationText: {
        flex: 1,
        fontSize: 14,
        color: '#374151'
    },
    locationPlaceholder: {
        color: '#9CA3AF',
        fontStyle: 'italic'
    },
    locationButtons: {
        flexDirection: 'row',
        gap: 8
    },
    gpsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#12A0AF',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        flex: 1,
        gap: 6
    },
    gpsButtonLoading: {
        backgroundColor: '#0E7C89'
    },
    gpsButtonText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600'
    },
    clearLocationButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center'
    },
    clearLocationText: {
        color: '#DC2626',
        fontSize: 18,
        fontWeight: 'bold'
    },

    // Facial
    facialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#8B5CF6',
        padding: 16,
        borderRadius: 8
    },
    facialButtonError: {
        borderWidth: 2,
        borderColor: '#EF4444'
    },
    facialButtonIcon: {
        fontSize: 24
    },
    facialButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600'
    },
    facialSuccess: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#D1FAE5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
        borderRadius: 8,
        padding: 12
    },
    facialSuccessIcon: {
        fontSize: 24,
        color: '#10B981'
    },
    facialSuccessInfo: {
        flex: 1,
        marginLeft: 12
    },
    facialSuccessText: {
        fontSize: 14,
        color: '#065F46',
        fontWeight: '600'
    },
    facialSuccessDetail: {
        fontSize: 12,
        color: '#047857',
        marginTop: 2
    },
    facialClearButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center'
    },
    facialClearText: {
        color: '#DC2626',
        fontSize: 14,
        fontWeight: 'bold'
    },

    // Layout
    layout: { marginBottom: 16 },
    layoutHorizontal: { flexDirection: 'row', flexWrap: 'wrap' },
    layoutChild: { flex: 1, minWidth: 150, marginHorizontal: 4 },

    // Repeater
    repeaterContainer: {
        marginBottom: 20,
        padding: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    repeaterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16
    },
    repeaterLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        flex: 1
    },
    repeaterRow: {
        backgroundColor: '#FFF',
        borderRadius: 8,
        marginBottom: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1
    },
    rowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6'
    },
    rowNumber: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280'
    },
    rowFields: {
        gap: 12
    },
    repeaterInfo: {
        fontSize: 12,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 8,
        fontStyle: 'italic'
    },
    addButton: {
        backgroundColor: '#12A0AF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        shadowColor: '#12A0AF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 2
    },
    addButtonText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600'
    },
    removeButton: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6
    },
    removeButtonText: {
        color: '#DC2626',
        fontSize: 12,
        fontWeight: '600'
    }, placeholder: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', padding: 12 }
});

export default {
    DateField,
    TimeField,
    NumberField,
    CheckboxField,
    RadioField,
    FileField,
    LocationField,
    FirmField,
    FacialField,
    RepeaterField,
    LayoutField
};
