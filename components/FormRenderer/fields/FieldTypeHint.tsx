/**
 * FieldTypeHint.tsx
 * Muestra una pista visual sobre el tipo de dato esperado en el campo
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getFieldTypeDescription, FieldType } from './FieldValidationHelper';

interface FieldTypeHintProps {
    fieldType: FieldType;
    show?: boolean;
}

export const FieldTypeHint: React.FC<FieldTypeHintProps> = ({ fieldType, show = true }) => {
    if (!show || fieldType === 'text') return null;

    const description = getFieldTypeDescription(fieldType);

    return (
        <View style={styles.container}>
            <Text style={styles.hintText}>{description}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 4,
        marginBottom: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: '#EFF6FF', // blue-50
        borderLeftWidth: 3,
        borderLeftColor: '#3B82F6', // blue-500
        borderRadius: 4,
    },
    hintText: {
        fontSize: 12,
        color: '#1E40AF', // blue-800
        lineHeight: 16,
    },
});

export default FieldTypeHint;
