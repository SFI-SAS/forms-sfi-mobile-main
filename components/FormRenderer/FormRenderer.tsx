/**
 * FormRenderer.tsx
 * Componente principal de renderizado de formularios
 * Port de FormPreviewRenderer.tsx de PC a React Native
 * ✅ Optimizado para evitar rerenders innecesarios
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    Platform
} from 'react-native';
import { FormItem } from '../../utils/FormDataAdapter';
import InputField from './fields/InputField';
import TextareaField from './fields/TextareaField';
import SelectField from './fields/SelectField';
import {
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
} from './fields/FieldStubs';

interface FormRendererProps {
    formStructure: FormItem[];
    values: Record<string, any>;
    onChange: (id: string, value: any) => void;
    errors: Record<string, string>;
    styleConfig?: any;
    correlations?: Record<string, Record<string, string>>;
    disabled?: boolean;
}

const FormRenderer: React.FC<FormRendererProps> = React.memo(({
    formStructure,
    values,
    onChange,
    errors,
    styleConfig,
    correlations = {},
    disabled = false
}) => {
    // 🔥 CRITICAL FIX: Limitar items para evitar ShadowNode overflow
    const MAX_SAFE_ITEMS = 30;
    const safeFormStructure = useMemo(() =>
        formStructure.slice(0, MAX_SAFE_ITEMS),
        [formStructure]
    );

    /**
     * Crear mapa bidireccional de correlaciones (optimizado con useMemo)
     * Basado en FormPreviewRenderer.tsx líneas 1923-1947
     */
    const createBidirectionalCorrelationMap = useMemo(() => {
        const bidirectionalMap: Record<string, Record<string, string>> = {};

        console.log('🔄 [FormRenderer] Creando mapa bidireccional de correlaciones...');

        // Agregar correlaciones directas
        Object.entries(correlations).forEach(([key, relatedValues]) => {
            if (!bidirectionalMap[key]) {
                bidirectionalMap[key] = {};
            }
            bidirectionalMap[key] = { ...bidirectionalMap[key], ...relatedValues };

            // Agregar correlaciones inversas (bidireccionales)
            Object.entries(relatedValues).forEach(([questionId, relatedValue]) => {
                if (!bidirectionalMap[relatedValue]) {
                    bidirectionalMap[relatedValue] = {};
                }
                // Si A->B, entonces B->A
                bidirectionalMap[relatedValue][questionId] = key;
            });
        });

        console.log('🎉 [FormRenderer] Mapa bidireccional creado:', bidirectionalMap);
        return bidirectionalMap;
    }, [correlations]);

    /**
     * Buscar todos los campos select recursivamente en la estructura
     * Basado en FormPreviewRenderer.tsx líneas 1970-1982
     */
    const findAllSelectFields = useCallback((items: FormItem[]): FormItem[] => {
        let selectFields: FormItem[] = [];

        items.forEach(item => {
            if (item.type === 'select') {
                selectFields.push(item);
            }
            if (item.children && item.children.length > 0) {
                selectFields = selectFields.concat(findAllSelectFields(item.children));
            }
        });

        return selectFields;
    }, []);

    /**
     * Maneja el autocompletado bidireccional de campos correlacionados
     * Basado en FormPreviewRenderer.tsx líneas 1950-2050
     * ✅ OPTIMIZADO: Usa mapa bidireccional y búsqueda recursiva
     */
    const handleCorrelationAutoComplete = useCallback(
        (selectedValue: string, sourceFieldId: string) => {
            console.log('🎯 INICIANDO AUTOCOMPLETADO BIDIRECCIONAL');
            console.log(`   📝 Valor seleccionado: "${selectedValue}"`);
            console.log(`   🔍 Campo fuente: "${sourceFieldId}"`);
            console.log(`   📊 Valores actuales:`, values);

            // Buscar correlaciones para el valor seleccionado
            const relatedValues = createBidirectionalCorrelationMap[selectedValue];

            if (!relatedValues) {
                console.log(`❌ No se encontraron correlaciones para "${selectedValue}"`);
                return;
            }

            console.log(`✅ Correlaciones encontradas para "${selectedValue}":`, relatedValues);

            // Obtener TODOS los campos select (incluyendo children recursivamente)
            const allSelectFields = findAllSelectFields(formStructure);
            console.log(`📋 Total campos select encontrados: ${allSelectFields.length}`);

            let autocompletedCount = 0;

            // Para cada correlación encontrada
            Object.entries(relatedValues).forEach(([questionId, correlatedValue]) => {
                console.log(`🔍 Procesando correlación: questionId="${questionId}" -> valor="${correlatedValue}"`);

                // Buscar campos select que podrían ser autocompletados
                allSelectFields.forEach(selectField => {
                    const fieldId = selectField.id;
                    const fieldOptions = selectField.props?.options || [];
                    const currentValue = values[fieldId];
                    const sourceQuestionId = selectField.props?.sourceQuestionId?.toString();

                    // No autocompletar el campo que originó la selección
                    if (fieldId === sourceFieldId) {
                        return;
                    }

                    console.log(`   📝 Evaluando campo "${fieldId}":`, {
                        label: selectField.props?.label || 'Sin label',
                        sourceQuestionId,
                        options: fieldOptions,
                        currentValue,
                        correlatedValue,
                        hasCorrelatedValue: fieldOptions.includes(correlatedValue),
                    });

                    // *** LÓGICA SIMPLIFICADA (igual que web) ***
                    // Autocompletar SI el valor está en las opciones del campo
                    const shouldAutoComplete =
                        !currentValue &&
                        fieldOptions.includes(correlatedValue) &&
                        correlatedValue.trim() !== '';

                    if (shouldAutoComplete) {
                        console.log(
                            `✅ AUTOCOMPLETANDO "${fieldId}" (${selectField.props?.label}) con "${correlatedValue}"`
                        );
                        onChange(fieldId, correlatedValue);
                        autocompletedCount++;
                    }
                    // Fallback: Match por sourceQuestionId
                    else if (
                        !currentValue &&
                        sourceQuestionId === questionId &&
                        fieldOptions.includes(correlatedValue) &&
                        correlatedValue.trim() !== ''
                    ) {
                        console.log(
                            `✅ AUTOCOMPLETANDO por sourceQuestionId "${fieldId}" (${selectField.props?.label}) con "${correlatedValue}"`
                        );
                        onChange(fieldId, correlatedValue);
                        autocompletedCount++;
                    } else {
                        const reasons = [];
                        if (currentValue) reasons.push(`ya tiene valor: "${currentValue}"`);
                        if (!fieldOptions.includes(correlatedValue))
                            reasons.push('valor no está en opciones');
                        if (!correlatedValue.trim()) reasons.push('valor está vacío');

                        if (reasons.length > 0) {
                            console.log(`⏭️ Campo "${fieldId}" saltado: ${reasons.join(', ')}`);
                        }
                    }
                });
            });

            console.log(`🎉 Autocompletado finalizado. Campos completados: ${autocompletedCount}`);
        },
        [createBidirectionalCorrelationMap, formStructure, values, onChange, findAllSelectFields]
    );

    const renderItem = useCallback((item: FormItem): React.ReactNode => {
        const value = values[item.id];
        const error = errors[item.id];

        // Crear onChange específico para este campo
        const handleChange = (val: any) => {
            console.log(`📝 [FormRenderer onChange] Campo: ${item.id}, Tipo: ${item.type}, Valor: ${val}`);
            onChange(item.id, val);
        };

        const commonProps = {
            id: item.id,
            label: item.props?.label,
            value,
            onChange: handleChange,
            error,
            disabled,
            ...item.props
        };

        // Detectar tipo de campo del backend y mapear a tipo de validación
        const getFieldType = (): any => {
            const props = item.props as any;
            const backendType = props?.fieldType || props?.type;

            // Mapeo de tipos del backend a tipos de validación
            const typeMap: Record<string, string> = {
                'number': 'number',
                'numeric': 'number',
                'email': 'email',
                'phone': 'phone',
                'tel': 'phone',
                'url': 'url',
                'alphanumeric': 'alphanumeric',
                'text': 'text',
            };

            return typeMap[backendType?.toLowerCase()] || 'text';
        };

        // Detectar keyboardType apropiado basado en fieldType
        const getKeyboardType = (): any => {
            const fieldType = getFieldType();
            const keyboardMap: Record<string, string> = {
                'number': 'numeric',
                'email': 'email-address',
                'phone': 'phone-pad',
                'url': 'url',
                'text': 'default',
                'alphanumeric': 'default',
            };
            return keyboardMap[fieldType] || 'default';
        };

        switch (item.type) {
            case 'input':
                return (
                    <View collapsable={false}>
                        <InputField
                            key={item.id}
                            {...commonProps}
                            fieldType={getFieldType()}
                            keyboardType={getKeyboardType()}
                        />
                    </View>
                );

            case 'textarea':
                return (
                    <View collapsable={false}>
                        <TextareaField key={item.id} {...commonProps} />
                    </View>
                );

            case 'select':
                return (
                    <View collapsable={false}>
                        <SelectField
                            key={item.id}
                            {...commonProps}
                            correlations={correlations}
                            itemId={item.id}
                            sourceQuestionId={item.props?.sourceQuestionId}
                            onCorrelationChange={handleCorrelationAutoComplete}
                        />
                    </View>
                );

            case 'date':
                return <DateField key={item.id} {...commonProps} />;

            case 'time':
                return <TimeField key={item.id} {...commonProps} />;

            case 'datetime':
                return <DateField key={item.id} {...commonProps} mode="datetime" />;

            case 'number':
                return <NumberField key={item.id} {...commonProps} />;

            case 'checkbox':
                return <CheckboxField key={item.id} {...commonProps} />;

            case 'radio':
                return <RadioField key={item.id} {...commonProps} />;

            case 'file':
                return (
                    <FileField
                        key={item.id}
                        {...commonProps}
                        // ✅ Si viene de repeater, usar sus props; si no, crear las propias
                        descriptionValue={item.props?.descriptionValue ?? values[`${item.id}_description`]}
                        onDescriptionChange={item.props?.onDescriptionChange ?? ((desc: string) => onChange(`${item.id}_description`, desc))}
                        questionId={item.questionId}
                    />
                );

            case 'location':
                return <LocationField key={item.id} {...commonProps} />;

            case 'firm':
                return <FirmField key={item.id} {...commonProps} />;

            case 'regisfacial':
                return <FacialField key={item.id} {...commonProps} />;

            case 'mathoperations':
                const mathProps = item.props as any;
                console.log('🔍 [FormRenderer] MathOperations item completo:', JSON.stringify(item, null, 2));
                console.log('🔍 [FormRenderer] item.props:', item.props);
                console.log('🔍 [FormRenderer] item.props?.code:', mathProps?.code);
                console.log('🔍 [FormRenderer] item.props?.mathExpression:', mathProps?.mathExpression);
                return (
                    <MathOperationsField
                        key={item.id}
                        {...commonProps}
                        mathExpression={mathProps?.code || mathProps?.mathExpression || ''}
                        formValues={values}
                        formStructure={safeFormStructure}
                    />
                );

            case 'repeater':
                return (
                    <RepeaterField
                        key={item.id}
                        {...commonProps}
                        children={item.children || []}
                        renderItem={renderItem}
                    />
                );

            case 'vertical-layout':
            case 'horizontal-layout':
                return (
                    <LayoutField
                        key={item.id}
                        {...commonProps}
                        type={item.type}
                        children={item.children || []}
                        renderItem={renderItem}
                    />
                );

            case 'label':
                return (
                    <View key={item.id} style={styles.labelContainer}>
                        <Text
                            style={[
                                styles.labelText,
                                {
                                    fontSize: parseInt(item.props?.fontSize || '16'),
                                    fontWeight: (item.props?.fontWeight || 'normal') as any,
                                    color: item.props?.color || '#000',
                                    textAlign: (item.props?.align || 'left') as any
                                }
                            ]}
                        >
                            {item.props?.text || 'Label'}
                        </Text>
                    </View>
                );

            case 'help-text':
                return (
                    <View key={item.id} style={styles.helpTextContainer}>
                        <Text style={styles.helpText}>
                            {item.props?.text || 'Help text'}
                        </Text>
                    </View>
                );

            case 'divider':
                return (
                    <View
                        key={item.id}
                        style={[
                            styles.divider,
                            {
                                height: item.props?.thickness || 1,
                                backgroundColor: item.props?.color || '#E5E7EB'
                            }
                        ]}
                    />
                );

            default:
                console.warn(`⚠️ Tipo de campo no soportado: ${item.type}`);
                return null;
        }
    }, [values, errors, disabled, handleCorrelationAutoComplete, onChange, safeFormStructure]);

    /**
     * Renderizado con FlatList para virtualización (soluciona crashes de ScrollView)
     */
    const renderFlatListItem = useCallback(({ item, index }: { item: FormItem; index: number }) => {
        return (
            <View style={styles.itemWrapper} collapsable={false}>
                {renderItem(item)}
            </View>
        );
    }, [renderItem]);

    const keyExtractor = useCallback((item: FormItem, index: number) => {
        return item.id || `form-item-${index}`;
    }, []);

    /**
     * Footer con espacio adicional para los botones de acción
     */
    const renderFooter = useCallback(() => {
        return <View style={styles.footerSpacer} />;
    }, []);

    return (
        <View style={{ flex: 1 }} collapsable={false}>
            <FlatList
                data={safeFormStructure}
                renderItem={renderFlatListItem}
                keyExtractor={keyExtractor}
                ListFooterComponent={renderFooter}
                contentContainerStyle={styles.container}
                // Optimizaciones de performance (REDUCIDAS para evitar crashes)
                removeClippedSubviews={true}
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={100}
                initialNumToRender={8}
                windowSize={10}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={false}
                disableVirtualization={false}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: 8
    },
    itemWrapper: {
        marginBottom: 12
    },
    footerSpacer: {
        height: 120 // Espacio para botones flotantes
    },
    labelContainer: {
        marginVertical: 8
    },
    labelText: {
        fontSize: 16
    },
    helpTextContainer: {
        marginVertical: 4
    },
    helpText: {
        fontSize: 14,
        color: '#6B7280',
        fontStyle: 'italic'
    },
    divider: {
        marginVertical: 12,
        height: 1,
        backgroundColor: '#E5E7EB'
    }
});

/**
 * Export con React.memo para evitar rerenders innecesarios
 * Solo re-renderiza si cambian props (values, errors, formStructure, etc.)
 */
export default React.memo(FormRenderer);
