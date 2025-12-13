/**
 * FieldMemo.tsx
 * Componente HOC para memoización inteligente de campos
 * Previene re-renders innecesarios cuando otros campos cambian
 */

import React from 'react';

interface FieldMemoProps {
    value: any;
    error?: string;
    disabled?: boolean;
    [key: string]: any;
}

/**
 * Comparador personalizado para React.memo
 * Solo re-renderiza si cambian value, error, o disabled
 */
export function areFieldPropsEqual(
    prevProps: FieldMemoProps,
    nextProps: FieldMemoProps
): boolean {
    // Comparar propiedades críticas
    if (prevProps.value !== nextProps.value) return false;
    if (prevProps.error !== nextProps.error) return false;
    if (prevProps.disabled !== nextProps.disabled) return false;
    if (prevProps.required !== nextProps.required) return false;

    // Comparar opciones de select (por referencia)
    if (prevProps.options !== nextProps.options) {
        // Si son arrays, comparar longitud y contenido
        if (Array.isArray(prevProps.options) && Array.isArray(nextProps.options)) {
            if (prevProps.options.length !== nextProps.options.length) return false;

            // Comparación superficial de opciones
            for (let i = 0; i < prevProps.options.length; i++) {
                if (prevProps.options[i] !== nextProps.options[i]) return false;
            }
        }
    }

    // Si llegamos aquí, las props relevantes son iguales
    return true;
}

/**
 * HOC para envolver campos con memoización inteligente
 */
export function withFieldMemo<P extends FieldMemoProps>(
    Component: React.ComponentType<P>
): React.ComponentType<P> {
    return React.memo(Component, areFieldPropsEqual);
}
