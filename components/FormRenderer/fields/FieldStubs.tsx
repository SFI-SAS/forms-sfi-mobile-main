// Stubs para campos que se implementarán completamente después
import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import InputField from './InputField';
import DateTimePicker from '@react-native-community/datetimepicker';

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
    <InputField {...props} keyboardType="numeric" fieldType="number" />
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

// FileField - Selector de archivos con DocumentPicker + descripción + serial (como en web)
export const FileField: React.FC<any> = ({
    label,
    required,
    value,
    onChange,
    error,
    disabled,
    descriptionValue,
    onDescriptionChange,
    questionId
}) => {
    const [fileName, setFileName] = React.useState(value || '');
    const [uploading, setUploading] = React.useState(false);
    const [showModal, setShowModal] = React.useState(false);
    const [generatedSerial, setGeneratedSerial] = React.useState<string | null>(null);
    const [serialLoading, setSerialLoading] = React.useState(false);

    // ✅ Limpiar serial anterior al montar (siempre generar uno nuevo)
    React.useEffect(() => {
        if (questionId) {
            const clearOldSerial = async () => {
                try {
                    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                    // Eliminar serial anterior si existe
                    await AsyncStorage.removeItem(`question-serial-${questionId}`);
                    console.log(`🗑️ [FileField] Serial anterior eliminado para questionId: ${questionId}`);
                } catch (err) {
                    console.error('Error limpiando serial anterior:', err);
                }
            };
            clearOldSerial();
        }
    }, [questionId]);

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

                // Guardar el archivo
                onChange && onChange({
                    name: file.name,
                    uri: file.uri,
                    size: file.size,
                    mimeType: file.mimeType
                });

                // Abrir modal para generar serial
                setShowModal(true);
            }
        } catch (err) {
            console.error('Error al seleccionar archivo:', err);
            Alert.alert('Error', 'No se pudo seleccionar el archivo');
        }
    };

    const handleGenerateSerial = async () => {
        if (!questionId) return;

        try {
            setSerialLoading(true);
            // Llamar al endpoint para generar serial
            const response = await fetch('https://api-forms-sfi.service.saferut.com/responses/file-serials/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questionId }),
            });

            const data = await response.json();
            const serial = data.serial;
            const idQuestionSerial = `${questionId}-${serial}`;

            // Guardar en AsyncStorage
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.setItem(`question-serial-${questionId}`, idQuestionSerial);

            setGeneratedSerial(serial);
        } catch (error) {
            console.error('Error generando serial:', error);
            Alert.alert('Error', 'No se pudo generar el serial');
        } finally {
            setSerialLoading(false);
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

            {/* Campo de descripción */}
            <View style={styles.descriptionContainer}>
                <Text style={styles.descriptionLabel}>Descripción *</Text>
                <TextInput
                    style={[styles.descriptionInput, error && styles.descriptionInputError]}
                    placeholder="Ingrese una descripción"
                    value={descriptionValue || ''}
                    onChangeText={(text) => {
                        console.log(`📝 [FileField] Descripción cambiada:`, text);
                        onDescriptionChange && onDescriptionChange(text);
                    }}
                    editable={!disabled}
                />
            </View>
            {descriptionValue && (
                <Text style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                    Descripción actual: {descriptionValue}
                </Text>
            )}

            {/* Campo de archivo */}
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

            {/* Mostrar serial generado si existe */}
            {generatedSerial && (
                <View style={styles.serialContainer}>
                    <Text style={styles.serialLabel}>Serial generado:</Text>
                    <Text style={styles.serialText}>{generatedSerial}</Text>
                    <Text style={styles.serialHint}>Escribe este serial en tu archivo</Text>
                </View>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            {/* Modal para generar serial */}
            {showModal && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {!generatedSerial ? (
                            <>
                                <Text style={styles.modalTitle}>
                                    ¿Desea generar un serial para este archivo?
                                </Text>
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={[styles.modalButton, styles.modalButtonYes]}
                                        onPress={handleGenerateSerial}
                                        disabled={serialLoading}
                                    >
                                        {serialLoading ? (
                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                        ) : (
                                            <Text style={styles.modalButtonText}>Sí</Text>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.modalButton, styles.modalButtonNo]}
                                        onPress={() => setShowModal(false)}
                                    >
                                        <Text style={[styles.modalButtonText, styles.modalButtonNoText]}>No</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={styles.modalTitle}>
                                    Este serial generado digítalo en tu archivo a subir:
                                </Text>
                                <Text style={styles.modalSerial}>{generatedSerial}</Text>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonContinue]}
                                    onPress={() => setShowModal(false)}
                                >
                                    <Text style={styles.modalButtonText}>Continuar</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            )}
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

// FacialField - Reconocimiento facial biométrico usando WebView Modal
export const FacialField: React.FC<any> = (props) => {
    // Usar el componente FacialRegisterField para registro facial
    const FacialRegisterField = require('../../FacialRegisterField').default;
    return <FacialRegisterField {...props} />;
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

                            // Props base
                            const baseProps = {
                                ...child.props,
                                value: row.values[child.id],
                                onChange: (val: any) => handleFieldChange(row.id, child.id, val)
                            };

                            // ✅ Si es un FileField, agregar props de descripción y questionId
                            if (child.type === 'file') {
                                baseProps.descriptionValue = row.values[`${child.id}_description`];
                                baseProps.onDescriptionChange = (desc: string) =>
                                    handleFieldChange(row.id, `${child.id}_description`, desc);
                                baseProps.questionId = child.questionId; // ✅ Pasar questionId para serial
                            }

                            // Crear una copia del child con el valor específico de esta fila
                            const childWithRowContext = {
                                ...child,
                                // Agregar sufijo al id para hacer único por fila
                                id: `${child.id}_${row.id}`,
                                props: baseProps
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
};// MathOperationsField - Campo de operaciones matemáticas con cálculo en tiempo real
export const MathOperationsField: React.FC<any> = React.memo(({
    label,
    value,
    mathExpression,
    formValues,
    formStructure,
    error,
    onChange,
    id
}) => {
    const [calculatedResult, setCalculatedResult] = React.useState<number | null>(null);
    const [lastCalculatedValue, setLastCalculatedValue] = React.useState<number | null>(null);

    // Sincronizar con el valor inicial/guardado
    React.useEffect(() => {
        if (value !== undefined && value !== null && value !== '') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                setCalculatedResult(numValue);
                setLastCalculatedValue(numValue);
                console.log(`🔄 [MathOperations] Valor inicial cargado: ${numValue}`);
            } else {
                // Si el valor no es un número válido (ej: un ID), limpiarlo
                console.warn(`⚠️ [MathOperations] Valor inicial inválido (no es número): ${value}, limpiando...`);
                if (onChange && id) {
                    onChange(id, null);
                }
            }
        }
    }, [value, onChange, id]);

    // Crear mapa de questionId -> form_design_element_id
    const questionIdMap = React.useMemo(() => {
        const map: Record<string, string> = {};

        const buildMap = (items: any[]) => {
            items.forEach((item) => {
                if (item.questionId) {
                    map[item.questionId.toString()] = item.id;
                }
                if (item.children) {
                    buildMap(item.children);
                }
            });
        };

        if (formStructure) {
            buildMap(formStructure);
        }

        return map;
    }, [formStructure]);

    // Calcular resultado en tiempo real cuando cambian los valores del formulario
    React.useEffect(() => {
        console.log('\n🔄 [MathOperations] useEffect ejecutándose...');
        console.log('🧮 [MathOperations] Campo ID:', id);
        console.log('🧮 [MathOperations] Label:', label);
        console.log('🧮 [MathOperations] Value actual:', value);
        console.log('🧮 [MathOperations] formValues:', JSON.stringify(formValues, null, 2));

        if (!mathExpression || typeof mathExpression !== 'string') {
            console.log('⚠️ [MathOperations] No hay mathExpression válida');
            setCalculatedResult(null);
            return;
        }

        try {
            // Reemplazar {ID} con valores reales de formValues
            let expression = mathExpression;
            const idMatches = expression.match(/\{(\d+)\}/g);

            if (!idMatches) {
                console.log('⚠️ [MathOperations] No se encontraron IDs en la expresión');
                setCalculatedResult(null);
                return;
            }

            console.log('🧮 [MathOperations] Expresión original:', mathExpression);
            console.log('🧮 [MathOperations] IDs encontrados:', idMatches);
            console.log('🧮 [MathOperations] Mapa questionId:', questionIdMap);

            // Reemplazar cada {ID} con su valor
            let allValuesFound = true;
            idMatches.forEach((match) => {
                const questionId = match.replace(/[{}]/g, '');

                // Buscar el form_design_element_id correspondiente al questionId
                const elementId = questionIdMap[questionId];

                if (!elementId) {
                    console.warn(`⚠️ [MathOperations] No se encontró elementId para questionId ${questionId}`);
                    allValuesFound = false;
                    return;
                }

                // Obtener el valor del formulario usando el elementId
                const fieldValue = formValues[elementId];

                console.log(`🧮 [MathOperations] questionId ${questionId} -> elementId ${elementId} -> valor: ${fieldValue}`);

                // Si el valor está vacío, usar 0
                let numValue = 0;
                if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
                    console.warn(`⚠️ [MathOperations] Valor vacío para questionId ${questionId}, usando 0`);
                    allValuesFound = false;
                } else {
                    numValue = parseFloat(fieldValue) || 0;
                }

                expression = expression.replace(match, numValue.toString());
            });

            if (!allValuesFound) {
                console.warn('⚠️ [MathOperations] No todos los valores fueron encontrados, resultado será 0 o incompleto');
            }

            console.log('🧮 [MathOperations] Expresión con valores:', expression);

            // 🔧 Agregar multiplicación implícita en todas las situaciones posibles
            // Casos: (a+b)c, c(a+b), )(, número(, )número, etc.

            // 1. )( -> )*(   ej: (2+3)(4+5) -> (2+3)*(4+5)
            expression = expression.replace(/\)\s*\(/g, ')*(');

            // 2. )número -> )*número   ej: (2+3)5 -> (2+3)*5
            expression = expression.replace(/\)\s*(\d)/g, ')*$1');

            // 3. número( -> número*(   ej: 5(2+3) -> 5*(2+3)
            expression = expression.replace(/(\d)\s*\(/g, '$1*(');

            // 4. Casos más complejos: después de operadores no insertar *
            // Ya están cubiertos porque solo afectamos ) o número seguido de ( o número

            console.log('🧮 [MathOperations] Expresión normalizada:', expression);

            // Validar que la expresión solo contenga números y operadores matemáticos
            const safeExpressionRegex = /^[\d\s+\-*/.()]+$/;
            if (!safeExpressionRegex.test(expression)) {
                console.error('❌ [MathOperations] Expresión contiene caracteres no válidos:', expression);
                setCalculatedResult(null);
                return;
            }

            // Evaluar la expresión matemática
            // IMPORTANTE: eval es peligroso en producción, pero aquí solo procesamos números
            const result = eval(expression);
            const finalResult = typeof result === 'number' && !isNaN(result) ? result : null;
            setCalculatedResult(finalResult);

            console.log('✅ [MathOperations] Resultado calculado:', finalResult);

            // 🔥 IMPORTANTE: Actualizar el valor del campo en formValues solo si cambió
            // Asegurar que el resultado sea un número válido antes de guardar
            if (onChange && id && finalResult !== null && !isNaN(finalResult) && finalResult !== lastCalculatedValue) {
                // Redondear a 2 decimales para evitar problemas de precisión flotante
                const roundedResult = Math.round(finalResult * 100) / 100;
                setLastCalculatedValue(roundedResult);
                onChange(id, roundedResult);
                console.log(`✅ [MathOperations] Valor actualizado en formValues[${id}]: ${roundedResult} (tipo: ${typeof roundedResult})`);
            }
        } catch (err) {
            console.error('❌ [MathOperations] Error calculando:', err);
            setCalculatedResult(null);
            // Limpiar el valor en caso de error
            if (onChange && id) {
                onChange(id, null);
            }
        }
    }, [mathExpression, formValues, questionIdMap, onChange, id]);

    return (
        <View style={styles.container}>
            {label && (
                <Text style={styles.label}>
                    {label}
                </Text>
            )}

            {/* Campo de resultado calculado (solo lectura) */}
            <View style={[styles.mathResultContainer, error && styles.mathResultError]}>
                <View style={styles.mathIconContainer}>
                    <Text style={styles.mathIcon}>🧮</Text>
                </View>
                <View style={styles.mathResultContent}>
                    <Text style={styles.mathResultLabel}>Resultado calculado:</Text>
                    <Text style={styles.mathResultValue}>
                        {calculatedResult !== null ? calculatedResult.toFixed(2) : '---'}
                    </Text>
                </View>
            </View>

            {/* Mostrar expresión original */}
            {mathExpression && (
                <Text style={styles.mathExpressionText}>
                    Fórmula: {mathExpression}
                </Text>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
}, (prevProps, nextProps) => {
    // Solo re-renderizar si cambian props relevantes
    return (
        prevProps.value === nextProps.value &&
        prevProps.mathExpression === nextProps.mathExpression &&
        prevProps.error === nextProps.error &&
        JSON.stringify(prevProps.formValues) === JSON.stringify(nextProps.formValues)
    );
});

// LayoutField - Renderiza hijos en vertical u horizontal
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
    },

    // File Field - Descripción
    descriptionContainer: {
        marginBottom: 12
    },
    descriptionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 6
    },
    descriptionInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: '#111827'
    },
    descriptionInputError: {
        borderColor: '#EF4444'
    },

    // File Field - Serial
    serialContainer: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#DBEAFE',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#93C5FD'
    },
    serialLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1E40AF',
        marginBottom: 4
    },
    serialText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1E3A8A',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        letterSpacing: 1,
        marginBottom: 4
    },
    serialHint: {
        fontSize: 11,
        color: '#1E40AF',
        fontStyle: 'italic'
    },

    // Modal
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
    },
    modalContent: {

        backgroundColor: '#FFF',
        padding: 24,
        borderRadius: 12,
        maxWidth: 340,
        width: '90%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 16
    },
    modalSerial: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2563EB',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        letterSpacing: 2,
        marginBottom: 16,
        textAlign: 'center'
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    },
    modalButton: {
        flex: 0,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center'
    },
    modalButtonYes: {
        flex: 1,
        backgroundColor: '#16A34A'
    },
    modalButtonNo: {
        flex: 1,
        backgroundColor: '#E5E7EB'
    },
    modalButtonContinue: {
        backgroundColor: '#2563EB',
        width: '100%'
    },
    modalButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF'
    },
    modalButtonNoText: {
        color: '#374151'
    },

    placeholder: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', padding: 12 },

    // MathOperations
    mathResultContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        borderWidth: 2,
        borderColor: '#DBEAFE',
        borderRadius: 12,
        padding: 16,
        marginBottom: 8
    },
    mathResultError: {
        borderColor: '#FEE2E2',
        backgroundColor: '#FEF2F2'
    },
    mathIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#3B82F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12
    },
    mathIcon: {
        fontSize: 24
    },
    mathResultContent: {
        flex: 1
    },
    mathResultLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '600',
        marginBottom: 4
    },
    mathResultValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1E40AF'
    },
    mathExpressionText: {
        fontSize: 11,
        color: '#9CA3AF',
        fontStyle: 'italic',
        marginTop: 4,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
    }
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
    LayoutField,
    MathOperationsField
};
