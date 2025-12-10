/**
 * TextareaField.tsx - Campo de texto multilínea
 * Usa componentes UI equivalentes a DaisyUI de PC
 */
import React from 'react';
import { Textarea } from '../../ui/FormUI';

interface TextareaFieldProps {
    label?: string;
    placeholder?: string;
    required?: boolean;
    value?: string;
    onChange: (value: string) => void;
    error?: string;
    disabled?: boolean;
    rows?: number;
}

const TextareaField: React.FC<TextareaFieldProps> = ({
    label,
    placeholder,
    required,
    value,
    onChange,
    error,
    disabled,
    rows = 4
}) => {
    return (
        <Textarea
            label={label}
            placeholder={placeholder}
            required={required}
            value={value || ''}
            onChangeText={onChange}
            error={!!error}
            errorMessage={error || 'Este campo es obligatorio'}
            editable={!disabled}
            rows={rows}
        />
    );
};

/**
 * Export con React.memo para evitar rerenders innecesarios
 */
export default React.memo(TextareaField);
