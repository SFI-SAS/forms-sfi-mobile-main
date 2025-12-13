/**
 * SelectField.tsx - Campo de selección dropdown
 * Usa componentes UI equivalentes a DaisyUI de PC
 * ✅ Optimizado con React.memo para evitar rerenders
 * ✅ Diferencia entre opciones de endpoint (table) vs form_design
 */
import React from 'react';
import { Select } from '../../ui/FormUI';
import { View, Text, StyleSheet } from 'react-native';

interface SelectFieldProps {
    label?: string;
    options?: string[];
    required?: boolean;
    value?: string;
    onChange: (value: string) => void;
    error?: string;
    disabled?: boolean;
    correlations?: Record<string, Record<string, string>>;
    itemId?: string;
    sourceQuestionId?: string;
    onCorrelationChange?: (selectedValue: string, sourceFieldId: string) => void;
    // Props de debug
    dataSource?: "table_endpoint" | "form_design";
    optionsSource?: "endpoint" | "form_design" | "fallback";
    questionType?: string;
}

const SelectField: React.FC<SelectFieldProps> = ({
    label,
    options = [],
    required,
    value,
    onChange,
    error,
    disabled,
    correlations,
    itemId,
    sourceQuestionId,
    onCorrelationChange,
    dataSource,
    optionsSource,
    questionType
}) => {
    /**
     * Maneja el cambio de valor y dispara autocompletado bidireccional
     * Implementación basada en FormPreviewRenderer.tsx líneas 235-268
     */
    const handleChange = (selectedValue: string) => {
        // Llamar al onChange original
        onChange(selectedValue);

        // ✅ IMPLEMENTADO: Lógica de correlaciones (autocompletado bidireccional)
        if (correlations && selectedValue && itemId && onCorrelationChange) {
            console.log('🔗 Correlación detectada:', {
                selectedValue,
                itemId,
                sourceQuestionId,
                dataSource,
                questionType
            });
            // Disparar autocompletado bidireccional
            onCorrelationChange(selectedValue, itemId);
        }
    };

    return (
        <View>
            <Select
                label={label}
                options={options}
                required={required}
                value={value || ''}
                onValueChange={handleChange}
                error={!!error}
                errorMessage={error || 'Seleccione una opción'}
                disabled={disabled}
            />

        </View>
    );
};

const styles = StyleSheet.create({
    debugContainer: {
        marginTop: 4,
        padding: 6,
        backgroundColor: '#FEF3C7',
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: '#F59E0B'
    },
    debugText: {
        fontSize: 11,
        color: '#92400E',
        fontWeight: '500'
    }
});

/**
 * Export con React.memo para evitar rerenders innecesarios
 * Solo re-renderiza si cambian las props relevantes
 */
export default React.memo(SelectField);
