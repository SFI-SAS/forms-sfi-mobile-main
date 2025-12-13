/**
 * SimplePicker.tsx
 * Reemplazo de @react-native-picker/picker que NO usa ShadowNodes complejos
 * Solución al crash: "Pointer tag for 0x8 was truncated" en React Native 0.81.5
 * 
 * ✅ Usa Modal nativo + FlatList virtualized
 * ✅ Sin dependencias en @react-native-picker/picker
 * ✅ Compatible con formularios que tienen múltiples SELECT
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TouchableWithoutFeedback,
    ScrollView,
    StyleSheet,
    Dimensions,
    Platform,
} from 'react-native';

interface SimplePickerProps {
    selectedValue: string;
    onValueChange: (value: string) => void;
    enabled?: boolean;
    style?: any;
    children?: React.ReactNode;
    options: Array<{ label: string; value: string }>;
}

/**
 * SimplePicker - Picker seguro sin ShadowNodes complejos
 * Renderiza un botón que abre un Modal con lista de opciones
 */
export const SimplePicker: React.FC<SimplePickerProps> = ({
    selectedValue,
    onValueChange,
    enabled = true,
    style,
    options = [],
}) => {
    const [modalVisible, setModalVisible] = useState(false);

    // 🔥 DEBUG: Verificar opciones recibidas con LOG COMPLETO
    React.useEffect(() => {
//         console.log(`
// ═══════════════════════════════════════════════════════════
// 🔍 SimplePicker - RECIBIENDO DATOS
// ═══════════════════════════════════════════════════════════
// 📊 Total opciones: ${options.length}
// 📌 Valor seleccionado: "${selectedValue}"
// 🔓 Enabled: ${enabled}
// 📋 TODAS las opciones:
// ${JSON.stringify(options, null, 2)}
// ═══════════════════════════════════════════════════════════
//         `);

        if (options.length === 0) {
            console.warn('⚠️ SimplePicker SIN OPCIONES - el array está vacío');
        } else {
            console.log(`✅ SimplePicker tiene ${options.length} opciones listas para mostrar`);
        }
    }, [options, selectedValue, enabled]);

    // Encuentra el label del valor seleccionado
    const selectedOption = options.find(opt => opt.value === selectedValue);
    const displayText = selectedOption?.label || 'Seleccionar...';

    const handleSelect = (value: string) => {
        console.log(`✅ SimplePicker - Opción seleccionada: "${value}"`);
        onValueChange(value);
        setModalVisible(false);
    };

    const handleOpenModal = () => {
        if (enabled) {
            console.log(`
🔓 ABRIENDO MODAL SimplePicker
   Total opciones a mostrar: ${options.length}
   Opciones: ${options.map(o => o.label).join(', ')}
            `);
            setModalVisible(true);
        }
    };

    return (
        <>
            {/* Botón que abre el modal */}
            <TouchableOpacity
                style={[styles.pickerButton, !enabled && styles.disabled, style]}
                onPress={handleOpenModal}
                disabled={!enabled}
                activeOpacity={0.7}
            >
                <Text
                    style={[
                        styles.pickerButtonText,
                        !selectedValue && styles.placeholder,
                    ]}
                    numberOfLines={1}
                >
                    {displayText}
                </Text>
                <Text style={styles.arrow}>▼</Text>
            </TouchableOpacity>

            {/* Modal con lista de opciones */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback onPress={() => { }}>
                            <View style={styles.modalContent}>
                                {/* Header del modal */}
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Seleccionar opción</Text>
                                    <TouchableOpacity
                                        onPress={() => setModalVisible(false)}
                                        style={styles.closeButton}
                                    >
                                        <Text style={styles.closeButtonText}>✕</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Lista de opciones */}
                                <ScrollView style={{ maxHeight: 400 }}>
                                    {(() => {
                                        console.log(`📜 RENDERIZANDO ${options.length} opciones en ScrollView del modal`);
                                        return options.map((item, index) => {
                                            if (index === 0) {
                                                console.log(`📌 Primera opción a renderizar: "${item.label}" (value: "${item.value}")`);
                                            }
                                            return (
                                                <TouchableOpacity
                                                    key={`${item.value}-${index}`}
                                                    style={[
                                                        styles.option,
                                                        item.value === selectedValue && styles.optionSelected,
                                                    ]}
                                                    onPress={() => handleSelect(item.value)}
                                                    activeOpacity={0.7}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.optionText,
                                                            item.value === selectedValue && styles.optionTextSelected,
                                                        ]}
                                                    >
                                                        {item.label}
                                                    </Text>
                                                    {item.value === selectedValue && (
                                                        <Text style={styles.checkmark}>✓</Text>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        });
                                    })()}
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </>
    );
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
    // Botón principal (simula un select)
    pickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 48,
        paddingHorizontal: 16,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
    },
    disabled: {
        backgroundColor: '#F3F4F6',
        opacity: 0.6,
    },
    pickerButtonText: {
        flex: 1,
        fontSize: 14,
        color: '#1F2937',
    },
    placeholder: {
        color: '#9CA3AF',
    },
    arrow: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 8,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
        maxHeight: SCREEN_HEIGHT * 0.7,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        overflow: 'visible',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
    closeButton: {
        padding: 4,
    },
    closeButtonText: {
        fontSize: 20,
        color: '#6B7280',
        fontWeight: '600',
    },

    // Lista de opciones
    optionsList: {
        flex: 1,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    optionSelected: {
        backgroundColor: '#EFF6FF',
    },
    optionText: {
        flex: 1,
        fontSize: 14,
        color: '#374151',
    },
    optionTextSelected: {
        color: '#2563EB',
        fontWeight: '600',
    },
    checkmark: {
        fontSize: 18,
        color: '#2563EB',
        fontWeight: '600',
        marginLeft: 8,
    },
});
