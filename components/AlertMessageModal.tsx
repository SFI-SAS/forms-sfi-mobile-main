/**
 * AlertMessageModal.tsx
 * Modal para mostrar mensajes de alerta antes de diligenciar un formulario
 */

import React from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Dimensions
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

interface AlertMessageModalProps {
    visible: boolean;
    message: string;
    onAccept: () => void;
    onCancel?: () => void;
}

export const AlertMessageModal: React.FC<AlertMessageModalProps> = ({
    visible,
    message,
    onAccept,
    onCancel
}) => {
    // Debug log
    React.useEffect(() => {
        if (visible) {
            console.log('🔔 [AlertMessageModal] Modal visible:', visible);
            console.log('📝 [AlertMessageModal] Mensaje recibido:', message);
            console.log('📏 [AlertMessageModal] Longitud del mensaje:', message?.length || 0);
        }
    }, [visible, message]);

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <LinearGradient
                        colors={['#4B34C7', '#6B46E5']}
                        style={styles.header}
                    >
                        <MaterialIcons name="info" size={32} color="#fff" />
                        <Text style={styles.headerTitle}>Mensaje Importante</Text>
                    </LinearGradient>

                    {/* Content */}
                    <ScrollView style={styles.contentContainer}>
                        <View style={styles.messageContainer}>
                            <Text style={styles.messageText}>{message}</Text>
                            {!message && (
                                <Text style={[styles.messageText, { color: '#999', fontStyle: 'italic' }]}>
                                    (Sin mensaje)
                                </Text>
                            )}
                        </View>
                    </ScrollView>

                    {/* Buttons */}
                    <View style={styles.buttonContainer}>
                        {onCancel && (
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton]}
                                onPress={onCancel}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.cancelButtonText}>Cancelar</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.button, styles.acceptButton]}
                            onPress={onAccept}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#4B34C7', '#6B46E5']}
                                style={styles.acceptButtonGradient}
                            >
                                <Text style={styles.acceptButtonText}>Entendido</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        width: width * 0.92,
        maxWidth: 600,
        maxHeight: height * 0.8,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    header: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 8,
    },
    contentContainer: {
        maxHeight: height * 0.5,
    },
    messageContainer: {
        padding: 20,
        paddingHorizontal: 24,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 22,
        color: '#333',
        textAlign: 'left',
    },
    buttonContainer: {
        flexDirection: 'row',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        gap: 12,
    },
    button: {
        flex: 1,
        borderRadius: 8,
        overflow: 'hidden',
    },
    cancelButton: {
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12,
    },
    cancelButtonText: {
        color: '#666',
        fontSize: 16,
        fontWeight: '600',
    },
    acceptButton: {
        flex: 1,
    },
    acceptButtonGradient: {
        paddingVertical: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    acceptButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
