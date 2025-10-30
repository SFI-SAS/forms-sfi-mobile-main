import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  Image,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";

// Mobile FormPreviewRenderer inspired by web Form_Render.tsx
// Supported item types: verticalLayout, horizontalLayout, repeater, input, textarea, number, date, datetime, time,
// file, select, checkbox, radio, label, helpText, divider, button, image, location, firm, regisfacial

const Label = ({ text, required }) => (
  <Text style={styles.label}>
    {text}
    {required ? <Text style={styles.required}> *</Text> : null}
  </Text>
);

const RNInput = ({
  value,
  onChangeText,
  placeholder,
  editable = true,
  multiline = false,
  keyboardType = "default",
}) => (
  <TextInput
    value={value ?? ""}
    onChangeText={onChangeText}
    placeholder={placeholder || ""}
    editable={editable}
    multiline={multiline}
    keyboardType={keyboardType}
    style={[styles.input, multiline && styles.textarea]}
  />
);
const RNSelect = ({ value, onValueChange, options = [], enabled = true }) => (
  <View style={styles.pickerContainer}>
    <View style={styles.pickerWrapper}>
      <Picker
        selectedValue={value ?? ""}
        onValueChange={onValueChange}
        enabled={enabled}
        mode="dropdown"
        style={styles.picker}
      >
        <Picker.Item label="Seleccione..." value="" />
        {options.map((opt, idx) => {
          if (typeof opt === "string")
            return <Picker.Item key={idx} label={opt} value={opt} />;
          return (
            <Picker.Item
              key={idx}
              label={opt.label ?? String(opt.value)}
              value={opt.value}
            />
          );
        })}
      </Picker>
    </View>
  </View>
);


const RNCheckbox = ({ value, onValueChange, disabled }) => (
  <View style={styles.checkboxRow}>
    <Switch value={!!value} onValueChange={onValueChange} disabled={disabled} />
  </View>
);

const FileField = ({ label, value, onPick, required }) => (
  <View style={styles.fieldBlock}>
    {label ? <Label text={label} required={required} /> : null}
    <TouchableOpacity style={styles.button} onPress={onPick}>
      <Text style={styles.buttonText}>Seleccionar archivo</Text>
    </TouchableOpacity>
    {value ? <Text style={styles.filePath}>{String(value)}</Text> : null}
  </View>
);

const DateField = ({ mode = "date", value, onChange }) => {
  const [show, setShow] = useState(false);
  return (
    <View>
      <TouchableOpacity style={styles.button} onPress={() => setShow(true)}>
        <Text style={styles.buttonText}>
          Seleccionar{" "}
          {mode === "time"
            ? "hora"
            : mode === "datetime"
              ? "fecha y hora"
              : "fecha"}
        </Text>
      </TouchableOpacity>
      <Text style={styles.hint}>{value ? String(value) : ""}</Text>
      {show && (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode={mode === "datetime" ? "datetime" : mode}
          onChange={(event, selected) => {
            setShow(false);
            if (selected) onChange(selected.toISOString());
          }}
        />
      )}
    </View>
  );
};

const Horizontal = ({ children, spacing = 12 }) => (
  <View style={[styles.row, { gap: spacing }]}>{children}</View>
);

const Vertical = ({ children, spacing = 12 }) => (
  <View style={{ gap: spacing }}>{children}</View>
);

const Repeater = ({ item, values = [], onChange, renderField }) => {
  const rows = Array.isArray(values) ? values : [];
  const add = () => {
    const next = [...rows, {}];
    onChange(next);
  };
  const remove = (idx) => {
    const next = rows.filter((_, i) => i !== idx);
    onChange(next);
  };
  const setCell = (idx, key, v) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [key]: v } : r));
    onChange(next);
  };
  return (
    <View style={styles.repeater}>
      {item.props?.label ? (
        <Text style={styles.repeaterTitle}>{item.props.label}</Text>
      ) : null}
      {rows.map((row, idx) => (
        <View key={idx} style={styles.repeaterCard}>
          <View style={{ gap: 10 }}>
            {(item.children || []).map((child) => (
              <View key={`${child.id}-${idx}`}>
                {renderField(
                  child,
                  row[child.id],
                  (v) => setCell(idx, child.id, v),
                  idx
                )}
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.smallButton, styles.danger]}
            onPress={() => remove(idx)}
          >
            <Text style={styles.smallButtonText}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.button} onPress={add}>
        <Text style={styles.buttonText}>
          {item.props?.addButtonText || "Agregar sección"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const renderLeaf = ({
  item,
  value,
  setValue,
  errors,
  onFileSelect,
  correlations,
  onCorrelationAutoFill,
}) => {
  const props = item.props || {};
  const error = !!errors?.[item.id];
  switch (item.type) {
    case "input":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <RNInput
            value={value}
            onChangeText={setValue}
            placeholder={props.placeholder}
            editable={!props.disabled}
          />
          {error ? (
            <Text style={styles.error}>Este campo es obligatorio</Text>
          ) : null}
        </View>
      );
    case "textarea":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <RNInput
            value={value}
            onChangeText={setValue}
            placeholder={props.placeholder}
            editable={!props.disabled}
            multiline
          />
          {error ? (
            <Text style={styles.error}>Este campo es obligatorio</Text>
          ) : null}
        </View>
      );
    case "number":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <RNInput
            value={value?.toString?.()}
            onChangeText={setValue}
            placeholder={props.placeholder}
            keyboardType="numeric"
          />
          {error ? (
            <Text style={styles.error}>Este campo es obligatorio</Text>
          ) : null}
        </View>
      );
    case "select":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <RNSelect
            value={value}
            options={props.options || []}
            onValueChange={(val) => {
              setValue(val);
              if (correlations && onCorrelationAutoFill)
                onCorrelationAutoFill(val, item.id);
            }}
          />
          {error ? (
            <Text style={styles.error}>Este campo es obligatorio</Text>
          ) : null}
        </View>
      );
    case "radio":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <View style={{ gap: 6 }}>
            {(props.options || []).map((opt, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.radioRow}
                onPress={() =>
                  setValue(typeof opt === "string" ? opt : opt.value)
                }
              >
                <View
                  style={[
                    styles.radioDot,
                    value === (typeof opt === "string" ? opt : opt.value) &&
                      styles.radioDotSelected,
                  ]}
                />
                <Text>{typeof opt === "string" ? opt : opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {error ? (
            <Text style={styles.error}>Seleccione una opción</Text>
          ) : null}
        </View>
      );
    case "checkbox":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <RNCheckbox value={!!value} onValueChange={(v) => setValue(v)} />
          {error ? (
            <Text style={styles.error}>Este campo es obligatorio</Text>
          ) : null}
        </View>
      );
    case "date":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <DateField mode="date" value={value} onChange={setValue} />
        </View>
      );
    case "datetime":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <DateField mode="datetime" value={value} onChange={setValue} />
        </View>
      );
    case "time":
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <DateField mode="time" value={value} onChange={setValue} />
        </View>
      );
    case "file":
      return (
        <FileField
          label={props.label}
          value={value}
          required={props.required}
          onPick={() => onFileSelect && onFileSelect(item.id)}
        />
      );
    case "label":
      return (
        <Text
          style={[
            styles.staticText,
            { fontWeight: props.fontWeight || "normal" },
          ]}
        >
          {props.text || ""}
        </Text>
      );
    case "helpText":
      return <Text style={styles.helpText}>{props.text || ""}</Text>;
    case "divider":
      return (
        <View
          style={[
            styles.divider,
            {
              height: props.thickness || 1,
              backgroundColor: props.color || "#E2E8F0",
            },
          ]}
        />
      );
    case "button":
      return (
        <TouchableOpacity
          style={styles.button}
          onPress={() => props.onClick?.()}
        >
          <Text style={styles.buttonText}>{props.text || "Botón"}</Text>
        </TouchableOpacity>
      );
    case "image":
      return (
        <View style={{ alignItems: "center" }}>
          {props.label ? <Label text={props.label} /> : null}
          {props.src ? (
            <Image
              source={{ uri: props.src }}
              style={{ width: 200, height: 120, borderRadius: 8 }}
            />
          ) : (
            <Text style={styles.helpText}>Sin imagen</Text>
          )}
        </View>
      );
    default:
      // Ocultar campos no soportados (no renderizar texto de error en UI)
      return null;
  }
};

const FormPreviewRenderer = ({
  formItems = [],
  values = {},
  onChange,
  errors = {},
  onFileSelect,
  isSubmitting = false,
  styleConfig,
  correlations = {},
  onRequestLocation,
  renderFirm,
}) => {
  const bidirectionalMap = useMemo(() => {
    const map = {};
    Object.entries(correlations || {}).forEach(([k, rel]) => {
      map[k] = { ...(map[k] || {}), ...(rel || {}) };
      Object.entries(rel || {}).forEach(([qid, val]) => {
        if (!map[val]) map[val] = {};
        map[val][qid] = k;
      });
    });
    return map;
  }, [correlations]);

  const handleCorrelationAutoFill = useCallback(
    (selectedValue, sourceFieldId) => {
      const related = bidirectionalMap[selectedValue];
      if (!related) return;
      Object.entries(related).forEach(([fieldId, val]) => {
        onChange(fieldId, val);
      });
    },
    [bidirectionalMap, onChange]
  );

  const renderItem = (item) => {
    const props = item.props || {};
    if (item.type === "verticalLayout") {
      return (
        <Vertical>
          {(item.children || []).map((child) => (
            <View key={child.id}>{renderItem(child)}</View>
          ))}
        </Vertical>
      );
    }
    if (item.type === "horizontalLayout") {
      return (
        <Horizontal>
          {(item.children || []).map((child) => (
            <View key={child.id} style={{ flex: 1, minWidth: 160 }}>
              {renderItem(child)}
            </View>
          ))}
        </Horizontal>
      );
    }
    if (item.type === "repeater") {
      const repeaterValue = values[item.id] || [];
      return (
        <Repeater
          item={item}
          values={repeaterValue}
          onChange={(v) => onChange(item.id, v)}
          renderField={(child, val, setter, rowIndex) => {
            // Allow external render for firm even inside repeaters
            if (child.type === "firm") {
              if (typeof renderFirm === "function") {
                return renderFirm({
                  item: child,
                  value: val,
                  setValue: setter,
                  rowIndex,
                });
              }
              return null;
            }
            return renderLeaf({
              item: child,
              value: val,
              setValue: setter,
              errors,
              onFileSelect,
              correlations,
              onCorrelationAutoFill: handleCorrelationAutoFill,
            });
          }}
        />
      );
    }
    // Leaf
    const value = values[item.id];
    const setValue = (v) => onChange(item.id, v);
    if (item.type === "location") {
      return (
        <View style={styles.fieldBlock}>
          {props.label ? (
            <Label text={props.label} required={props.required} />
          ) : null}
          <TouchableOpacity
            style={styles.button}
            onPress={() => onRequestLocation && onRequestLocation(item.id)}
          >
            <Text style={styles.buttonText}>Obtener ubicación</Text>
          </TouchableOpacity>
          {value ? <Text style={styles.hint}>{String(value)}</Text> : null}
          {errors?.[item.id] ? (
            <Text style={styles.error}>Este campo es obligatorio</Text>
          ) : null}
        </View>
      );
    }
    if (item.type === "firm") {
      if (typeof renderFirm === "function") {
        // Non-repeater firm
        return renderFirm({ item, value, setValue, rowIndex: undefined });
      }
      // Si no hay renderer de firma, ocultar el campo en lugar de mostrar mensaje
      return null;
    }
    return renderLeaf({
      item,
      value,
      setValue,
      errors,
      onFileSelect,
      correlations,
      onCorrelationAutoFill: handleCorrelationAutoFill,
    });
  };

  return (
    <View style={styles.container}>
      {(formItems || []).map((it) => (
        <View key={it.id} style={styles.block}>
          {renderItem(it)}
        </View>
      ))}
    </View>
  );
};

export default FormPreviewRenderer;

const styles = StyleSheet.create({
  pickerContainer: {
  borderWidth: 1,
  borderColor: "#E2E8F0",
  borderRadius: 8,
  backgroundColor: "#FFF",
},
  container: {
    gap: 16,
  },
  block: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D3748",
    marginBottom: 6,
  },
  required: { color: "#E53E3E" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFF",
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#FFF",
  },
  picker: {
    height: 60,
    width: "100%",
    marginVertical: -8, // Ajusta este valor según se vea en tu dispositivo
  },
  checkboxRow: { flexDirection: "row", alignItems: "center" },
  button: {
    backgroundColor: "#0F8390",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "#FFF", fontWeight: "700" },
  smallButton: {
    backgroundColor: "#CBD5E1",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  smallButtonText: { color: "#1A202C", fontWeight: "600" },
  danger: { backgroundColor: "#F56565" },
  filePath: { marginTop: 6, color: "#475569" },
  helpText: { color: "#6B7280", fontStyle: "italic" },
  divider: { width: "100%", backgroundColor: "#E2E8F0", marginVertical: 8 },
  staticText: { fontSize: 14, color: "#2D3748" },
  row: { flexDirection: "row", flexWrap: "wrap" },
  repeater: { gap: 8 },
  repeaterTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2D3748",
    marginBottom: 8,
  },
  repeaterCard: {
    backgroundColor: "#F7FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  error: { color: "#DC2626", marginTop: 4, fontSize: 12 },
  hint: { color: "#64748B", marginTop: 6 },
});
