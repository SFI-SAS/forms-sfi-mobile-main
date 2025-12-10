/**
 * InputField.tsx - Campo de texto simple
 * Usa componentes UI equivalentes a DaisyUI de PC
 */
import React from 'react';
import { Input } from '../../ui/FormUI';

interface InputFieldProps {
    label?: string;
    placeholder?: string;
    required?: boolean;
    value?: string;
    onChange: (value: string) => void;
    error?: string;
    disabled?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({
    label,
    placeholder,
    required,
    value,
    onChange,
    error,
    disabled
}) => {
    return (
        <Input
            label={label}
            placeholder={placeholder}
            required={required}
            value={value || ''}
            onChangeText={onChange}
            error={!!error}
            errorMessage={error || 'Este campo es obligatorio'}
            editable={!disabled}
        />
    );
};

/**
 * Export con React.memo para evitar rerenders innecesarios
 */
export default React.memo(InputField);
