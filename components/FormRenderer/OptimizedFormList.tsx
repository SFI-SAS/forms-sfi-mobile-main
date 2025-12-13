/**
 * OptimizedFormList.tsx
 * Lista virtualizada de campos de formulario para mejor rendimiento
 * Reemplaza ScrollView con FlatList para virtualización automática
 * 
 * SOLUCIONA: Crashes por exceso de componentes ShadowNode/ScrollView
 */

import React, { useCallback } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { FormItem } from '../../utils/FormDataAdapter';

interface OptimizedFormListProps {
    items: FormItem[];
    values: Record<string, any>;
    onChange: (id: string, value: any) => void;
    errors: Record<string, string>;
    renderItem: (item: FormItem, index: number) => React.ReactElement | null;
    disabled?: boolean;
    onEndReached?: () => void;
}

const OptimizedFormList: React.FC<OptimizedFormListProps> = ({
    items,
    values,
    onChange,
    errors,
    renderItem,
    disabled = false,
    onEndReached
}) => {
    /**
     * Función de renderizado memoizada para FlatList
     */
    const renderFormItem = useCallback(({ item, index }: { item: FormItem; index: number }) => {
        return (
            <View style={styles.itemContainer}>
                {renderItem(item, index)}
            </View>
        );
    }, [renderItem]);

    /**
     * Función de key extractor para optimizar reconciliación
     */
    const keyExtractor = useCallback((item: FormItem, index: number) => {
        return item.id || `form-item-${index}`;
    }, []);

    /**
     * Configuración de performance
     */
    const getItemLayout = useCallback((data: any, index: number) => ({
        length: 80, // Altura estimada por item (ajustar según necesidad)
        offset: 80 * index,
        index,
    }), []);

    return (
        <FlatList
            data={items}
            renderItem={renderFormItem}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            // Virtualización optimizada
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            initialNumToRender={15}
            windowSize={21}
            // Callbacks
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            // Estilo
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            // Performance
            disableIntervalMomentum={true}
        />
    );
};

const styles = StyleSheet.create({
    contentContainer: {
        paddingHorizontal: 16,
        paddingBottom: 100
    },
    itemContainer: {
        marginBottom: 12
    }
});

export default React.memo(OptimizedFormList);
