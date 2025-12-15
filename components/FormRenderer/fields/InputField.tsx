/**
 * InputField.tsx - Campo de texto simple con validación en tiempo real
 * Usa componentes UI equivalentes a DaisyUI de PC
 */
import React from 'react';
import { View } from 'react-native';
import { Input } from '../../ui/FormUI';
import { validators, FieldType, getFieldTypeDescription } from './FieldValidationHelper';
import FieldTypeHint from './FieldTypeHint';

interface InputFieldProps {
    label?: string;
    placeholder?: string;
    required?: boolean;
    value?: string;
    onChange: (value: string) => void;
    error?: string;
    disabled?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
    fieldType?: FieldType;
    showTypeHint?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({
    label,
    placeholder,
    required,
    value,
    onChange,
    error,
    disabled,
    keyboardType = 'default',
    fieldType = 'text',
    showTypeHint = false
}) => {
    const [validationError, setValidationError] = React.useState<string>('');

    // Validación en tiempo real usando el sistema de validadores
    const handleChange = (text: string) => {
        // Obtener validador para este tipo de campo
        const validator = validators[fieldType] || validators.text;
        const result = validator(text);

        // Actualizar error de validación
        setValidationError(result.errorMessage || '');

        // Siempre actualizar el valor (permitir escritura)
        onChange(text);
    };

    // Error final: priorizar validación de tipo, luego error externo
    const finalError = validationError || error;

    // Log de tipo de campo para debugging
    React.useEffect(() => {
        if (fieldType !== 'text') {
            console.log(`📋 Campo tipo "${fieldType}": ${getFieldTypeDescription(fieldType)}`);
        }
    }, [fieldType]);

    return (
        <View>
            {/* Mostrar pista de tipo de campo si está habilitado */}
            {showTypeHint && <FieldTypeHint fieldType={fieldType} />}

            <Input
                label={label}
                placeholder={placeholder}
                required={required}
                value={value || ''}
                onChangeText={handleChange}
                keyboardType={keyboardType}
                error={!!finalError}
                errorMessage={finalError || 'Este campo es obligatorio'}
                editable={!disabled}
            />
        </View>
    );
};

/**
 * Export con React.memo para evitar rerenders innecesarios
 */
export default React.memo(InputField);
