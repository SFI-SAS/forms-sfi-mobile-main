/**
 * FormUI.tsx
 * Componentes UI equivalentes a DaisyUI de PC para React Native
 * Mantiene el mismo estilo y comportamiento que la versión web
 */

import React from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ViewStyle,
    TextStyle,
    TextInputProps,
} from 'react-native';
import { SimplePicker } from './SimplePicker';

// ============================================
// INTERFACES
// ============================================

interface FormControlProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

interface LabelProps {
    children: React.ReactNode;
    required?: boolean;
    style?: TextStyle;
}

interface ErrorTextProps {
    children: React.ReactNode;
}

interface InputFieldProps extends TextInputProps {
    label?: string;
    required?: boolean;
    error?: boolean;
    errorMessage?: string;
}

interface SelectFieldProps {
    label?: string;
    required?: boolean;
    error?: boolean;
    errorMessage?: string;
    options?: string[];
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
}

// ============================================
// COMPONENTES BASE (equivalentes a DaisyUI)
// ============================================

/**
 * FormControl - Equivalente a .form-control de DaisyUI
 * Contenedor principal de campos de formulario
 */
export const FormControl: React.FC<FormControlProps> = ({ children, style }) => (
    <View style={[styles.formControl, style]}>
        {children}
    </View>
);

/**
 * Label - Equivalente a .label de DaisyUI
 * Etiqueta de campos con soporte para campos requeridos
 */
export const Label: React.FC<LabelProps> = ({ children, required, style }) => (
    <View style={styles.labelContainer}>
        <Text style={[styles.labelText, style]}>
            {children}
            {required && <Text style={styles.requiredStar}> *</Text>}
        </Text>
    </View>
);

/**
 * ErrorText - Mensaje de error para campos
 */
export const ErrorText: React.FC<ErrorTextProps> = ({ children }) => (
    <Text style={styles.errorText}>{children}</Text>
);

/**
 * Input - Equivalente a .input.input-bordered de DaisyUI
 * Campo de texto con estilo consistente
 */
export const Input: React.FC<InputFieldProps> = ({
    label,
    required,
    error,
    errorMessage,
    style,
    ...props
}) => (
    <FormControl>
        {label && <Label required={required}>{label}</Label>}
        <TextInput
            style={[
                styles.input,
                error && styles.inputError,
                style
            ]}
            placeholderTextColor="#9CA3AF"
            {...props}
        />
        {error && errorMessage && (
            <ErrorText>{errorMessage}</ErrorText>
        )}
    </FormControl>
);

/**
 * Textarea - Campo de texto multilínea
 */
export const Textarea: React.FC<InputFieldProps & { rows?: number }> = ({
    label,
    required,
    error,
    errorMessage,
    rows = 3,
    style,
    ...props
}) => (
    <FormControl>
        {label && <Label required={required}>{label}</Label>}
        <TextInput
            style={[
                styles.textarea,
                { height: rows * 24 + 16 }, // altura aproximada por línea
                error && styles.inputError,
                style
            ]}
            multiline
            numberOfLines={rows}
            textAlignVertical="top"
            placeholderTextColor="#9CA3AF"
            {...props}
        />
        {error && errorMessage && (
            <ErrorText>{errorMessage}</ErrorText>
        )}
    </FormControl>
);

/**
 * Select - Equivalente a .select.select-bordered de DaisyUI
 * Campo de selección dropdown
 * ✅ ACTUALIZADO: Usa SimplePicker en lugar de @react-native-picker/picker
 * ✅ SOLUCIÓN: Evita crashes por ShadowNodes en React Native 0.81.5
 */
export const Select: React.FC<SelectFieldProps> = ({
    label,
    required,
    error,
    errorMessage,
    options = [],
    value,
    onValueChange,
    disabled = false,
}) => {
    // DEBUG: Ver qué opciones recibe Select
    React.useEffect(() => {
        console.log('🎯 FormUI.Select recibió:', {
            label,
            optionsLength: options.length,
            optionsType: typeof options,
            isArray: Array.isArray(options),
            firstOptions: options.slice(0, 3),
            value
        });
    }, [options, label, value]);

    // Convertir array de strings a formato { label, value }
    const pickerOptions = [
        { label: 'Seleccionar...', value: '' },
        ...options.map(opt => ({ label: opt, value: opt }))
    ];

    return (
        <FormControl>
            {label && <Label required={required}>{label}</Label>}
            <View style={[styles.selectContainer, error && styles.inputError]}>
                <SimplePicker
                    selectedValue={value || ''}
                    onValueChange={onValueChange || (() => { })}
                    enabled={!disabled}
                    options={pickerOptions}
                    style={styles.picker}
                />
            </View>
            {error && errorMessage && (
                <ErrorText>{errorMessage}</ErrorText>
            )}
        </FormControl>
    );
};

// ============================================
// ESTILOS (Basados en DaisyUI + Tailwind)
// ============================================

const styles = StyleSheet.create({
    // FormControl - Contenedor principal
    formControl: {
        width: '100%',
        marginBottom: 16,
        position: 'relative',
    },

    // Label - Etiqueta
    // Label - Etiqueta
    labelContainer: {
        marginBottom: 8,
    },
    labelText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#374151', // gray-700
        lineHeight: 20,
    },
    requiredStar: {
        color: '#EF4444', // red-500
        fontWeight: '600',
    },

    // Input - Campo de texto (equivalente a DaisyUI input + input-bordered)
    input: {
        width: '100%',
        height: 48,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D1D5DB', // gray-300
        borderRadius: 8,
        color: '#1F2937', // gray-800
    },

    // Input con error
    inputError: {
        borderColor: '#EF4444', // red-500
        borderWidth: 2,
    },

    // Textarea
    textarea: {
        width: '100%',
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        color: '#1F2937',
    },

    // ErrorText
    errorText: {
        fontSize: 12,
        color: '#EF4444', // red-500
        marginTop: 4,
        lineHeight: 16,
    },

    // Select - Campo de selección (equivalente a DaisyUI select + select-bordered)
    selectContainer: {
        width: '100%',
        borderWidth: 1,
        borderColor: '#D1D5DB', // gray-300
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
    },
    picker: {
        height: 48,
    },
});

// ============================================
// VARIANTES DE COLOR (Basadas en DaisyUI)
// ============================================

export const colorVariants = {
    primary: {
        background: '#12A0AF',
        border: '#0E7C87',
        text: '#FFFFFF',
    },
    secondary: {
        background: '#6B7280',
        border: '#4B5563',
        text: '#FFFFFF',
    },
    accent: {
        background: '#F59E0B',
        border: '#D97706',
        text: '#FFFFFF',
    },
    success: {
        background: '#10B981',
        border: '#059669',
        text: '#FFFFFF',
    },
    warning: {
        background: '#F59E0B',
        border: '#D97706',
        text: '#FFFFFF',
    },
    error: {
        background: '#EF4444',
        border: '#DC2626',
        text: '#FFFFFF',
    },
    info: {
        background: '#3B82F6',
        border: '#2563EB',
        text: '#FFFFFF',
    },
};

// ============================================
// UTILIDADES (equivalentes a clases Tailwind)
// ============================================

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
};

export const borderRadius = {
    none: 0,
    sm: 4,
    DEFAULT: 8,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 24,
    full: 9999,
};

export const fontSize = {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
};

export const fontWeight = {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
};
