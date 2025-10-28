import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";

const { width, height } = Dimensions.get("window");

export default function QuestionRenderer({
  question,
  isLocked,
  answers,
  textAnswers,
  tableAnswersState,
  tableAnswers,
  datePickerVisible,
  fileSerials,
  fileUris,
  pickerSearch,
  tableAutoFilled,
  locationError,
  locationRelatedAnswers,
  locationSelected,
  allowAddRemove,
  setAnswers,
  handleTextChange,
  handleRemoveTextField,
  handleAddTextField,
  handleTableSelectChangeWithCorrelation,
  setPickerSearch,
  setDatePickerVisible,
  handleDateChange,
  handleFileButtonPress,
  handleCaptureLocation,
  setLocationSelected,
  handleAddTableAnswer,
  handleRemoveTableAnswer,
}) {
  const renderTextQuestion = () => (
    <>
      {textAnswers[question.id]?.map((field, index) => (
        <View key={index} style={styles.dynamicFieldContainer}>
          <TextInput
            style={styles.input}
            placeholder={
              question.placeholder ||
              (question.props && question.props.placeholder) ||
              "Escribe tu respuesta"
            }
            value={field}
            onChangeText={(text) =>
              !isLocked && handleTextChange(question.id, index, text)
            }
            editable={!isLocked}
          />
          {allowAddRemove && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveTextField(question.id, index)}
            >
              <Text style={styles.removeButtonText}>-</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      {allowAddRemove && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleAddTextField(question.id)}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const renderFileQuestion = () => (
    <View
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        width: "100%",
      }}
    >
      <TouchableOpacity
        style={[
          styles.fileButton,
          fileUris[question.id] && { backgroundColor: "#20B46F" },
        ]}
        onPress={async () => {
          if (!isLocked) {
            await handleFileButtonPress(question.id);
          }
        }}
        disabled={isLocked}
      >
        <Text style={styles.fileButtonText}>
          {fileUris[question.id] ? "Archivo seleccionado" : "Subir archivo"}
        </Text>
      </TouchableOpacity>
      {fileSerials[question.id] && (
        <View style={{ marginTop: 6, marginLeft: 2 }}>
          <Text
            style={{
              color: "#2563eb",
              fontWeight: "bold",
              fontSize: 13,
            }}
          >
            Serial asignado: {fileSerials[question.id]}
          </Text>
        </View>
      )}
    </View>
  );

  const renderTableQuestion = () => (
    <>
      {tableAnswersState[question.id]?.map((field, index) => (
        <View key={index} style={styles.dynamicFieldContainer}>
          <View style={styles.pickerSearchWrapper}>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder={
                question.placeholder ||
                (question.props && question.props.placeholder) ||
                "Buscar opción..."
              }
              value={pickerSearch[`${question.id}_${index}`] || ""}
              onChangeText={(text) =>
                setPickerSearch((prev) => ({
                  ...prev,
                  [`${question.id}_${index}`]: text,
                }))
              }
              editable={!isLocked}
            />
          </View>
          <Picker
            selectedValue={field}
            onValueChange={(selectedValue) =>
              !isLocked &&
              handleTableSelectChangeWithCorrelation(
                question.id,
                index,
                selectedValue
              )
            }
            mode="dropdown"
            style={[
              styles.picker,
              tableAutoFilled[question.id] &&
                tableAutoFilled[question.id][index] && {
                  backgroundColor: "#e6fafd",
                  borderColor: "#22c55e",
                },
            ]}
            enabled={!isLocked}
          >
            <Picker.Item
              label={question.placeholder || "Selecciona una opción"}
              value=""
            />
            {Array.isArray(tableAnswers[question.id]) &&
              tableAnswers[question.id]
                .filter((option) =>
                  (pickerSearch[`${question.id}_${index}`] || "") === ""
                    ? true
                    : option
                        .toLowerCase()
                        .includes(
                          pickerSearch[
                            `${question.id}_${index}`
                          ]?.toLowerCase() || ""
                        )
                )
                .map((option, i) => (
                  <Picker.Item key={i} label={option} value={option} />
                ))}
          </Picker>
          {allowAddRemove && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveTableAnswer(question.id, index)}
            >
              <Text style={styles.removeButtonText}>-</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      {allowAddRemove && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleAddTableAnswer(question.id)}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const renderMultipleChoiceQuestion = () => (
    <View>
      {question.options?.map((option, index) => (
        <View key={index} style={styles.checkboxContainer}>
          <TouchableOpacity
            style={[
              styles.checkbox,
              answers[question.id]?.includes(option) && styles.checkboxSelected,
            ]}
            onPress={() =>
              !isLocked &&
              setAnswers((prev) => {
                const currentAnswers = prev[question.id] || [];
                const updatedAnswers = currentAnswers.includes(option)
                  ? currentAnswers.filter((o) => o !== option)
                  : [...currentAnswers, option];
                return {
                  ...prev,
                  [question.id]: updatedAnswers,
                };
              })
            }
            disabled={isLocked}
          >
            {answers[question.id]?.includes(option) && (
              <Text style={styles.checkboxCheckmark}>✔</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.checkboxLabel}>{option}</Text>
        </View>
      ))}
    </View>
  );

  const renderOneChoiceQuestion = () => (
    <View>
      {question.options?.map((option, index) => (
        <View key={index} style={styles.checkboxContainer}>
          <TouchableOpacity
            style={[
              styles.checkbox,
              answers[question.id] === option && styles.checkboxSelected,
            ]}
            onPress={() =>
              !isLocked &&
              setAnswers((prev) => ({
                ...prev,
                [question.id]: option,
              }))
            }
            disabled={isLocked}
          >
            {answers[question.id] === option && (
              <Text style={styles.checkboxCheckmark}>✔</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.checkboxLabel}>{option}</Text>
        </View>
      ))}
    </View>
  );

  const renderNumberQuestion = () => (
    <TextInput
      style={styles.input}
      placeholder={
        question.placeholder ||
        (question.props && question.props.placeholder) ||
        "Escribe un número"
      }
      keyboardType="numeric"
      value={answers[question.id]?.[0] || ""}
      onChangeText={(value) =>
        !isLocked &&
        setAnswers((prev) => ({
          ...prev,
          [question.id]: [value],
        }))
      }
      editable={!isLocked}
    />
  );

  const renderDateQuestion = () => (
    <>
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() =>
          !isLocked &&
          setDatePickerVisible((prev) => ({
            ...prev,
            [question.id]: true,
          }))
        }
        disabled={isLocked}
      >
        <Text style={styles.dateButtonText}>
          {answers[question.id] || question.placeholder || "Seleccionar fecha"}
        </Text>
      </TouchableOpacity>
      {datePickerVisible[question.id] && (
        <DateTimePicker
          value={
            answers[question.id] ? new Date(answers[question.id]) : new Date()
          }
          mode="date"
          display="default"
          onChange={(event, selectedDate) =>
            !isLocked && handleDateChange(question.id, selectedDate)
          }
        />
      )}
    </>
  );

  const renderLocationQuestion = () => {
    const relatedOptions = locationRelatedAnswers[question.id] || [];
    return (
      <View style={{ width: "100%", marginBottom: 8 }}>
        <TouchableOpacity
          style={[
            styles.locationButton,
            answers[question.id] && { backgroundColor: "#22c55e" },
          ]}
          onPress={() => handleCaptureLocation(question.id)}
          disabled={isLocked}
        >
          <Text style={styles.locationButtonText}>
            {answers[question.id]
              ? "Ubicación capturada"
              : "Capturar ubicación"}
          </Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={answers[question.id] || ""}
          placeholder="Latitud, Longitud"
          editable={false}
          selectTextOnFocus={false}
        />
        {relatedOptions.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text
              style={{
                color: "#2563eb",
                fontWeight: "bold",
                marginBottom: 4,
              }}
            >
              Selecciona una ubicación relacionada:
            </Text>
            <Picker
              selectedValue={locationSelected[question.id] || ""}
              onValueChange={(val) => {
                setLocationSelected((prev) => ({
                  ...prev,
                  [question.id]: val,
                }));
                setAnswers((prev) => ({
                  ...prev,
                  [question.id]: val,
                }));
              }}
              mode="dropdown"
              style={styles.picker}
              enabled={!isLocked}
            >
              <Picker.Item label="Selecciona una ubicación" value="" />
              {relatedOptions.map((opt, idx) => (
                <Picker.Item
                  key={idx}
                  label={opt.label + " (" + opt.value + ")"}
                  value={opt.value}
                />
              ))}
            </Picker>
          </View>
        )}
        {locationError[question.id] && (
          <Text style={{ color: "#ef4444", fontSize: 13 }}>
            {locationError[question.id]}
          </Text>
        )}
      </View>
    );
  };

  const renderQuestionContent = () => {
    switch (question.question_type) {
      case "text":
        return renderTextQuestion();
      case "file":
        return renderFileQuestion();
      case "table":
        return renderTableQuestion();
      case "multiple_choice":
        return renderMultipleChoiceQuestion();
      case "one_choice":
        return renderOneChoiceQuestion();
      case "number":
        return renderNumberQuestion();
      case "date":
        return renderDateQuestion();
      case "location":
        return renderLocationQuestion();
      default:
        return null;
    }
  };

  return (
    <View key={question.id} style={styles.questionContainer}>
      <Text style={styles.questionLabel}>
        {question.question_text}
        {question.required && <Text style={styles.requiredText}> *</Text>}
      </Text>
      {renderQuestionContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  questionContainer: { marginBottom: height * 0.025 },
  questionLabel: {
    fontSize: width * 0.048,
    fontWeight: "bold",
    color: "#4B34C7",
    marginBottom: height * 0.01,
  },
  requiredText: {
    color: "#ef4444",
    fontWeight: "bold",
    marginLeft: width * 0.01,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    borderRadius: width * 0.02,
    padding: height * 0.015,
    backgroundColor: "#f3f4f6",
    fontSize: width * 0.045,
    width: width * 0.75,
    marginBottom: 6,
    color: "#222",
  },
  picker: {
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    borderRadius: width * 0.02,
    backgroundColor: "#f3f4f6",
    marginTop: 0,
    width: "100%",
    color: "#222",
  },
  fileButton: {
    backgroundColor: "#9225EBFF",
    padding: height * 0.018,
    borderRadius: width * 0.02,
    alignItems: "center",
    borderColor: "#12A0AF",
    borderWidth: 1.5,
    width: width * 0.75,
    marginTop: 4,
  },
  fileButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  dateButton: {
    backgroundColor: "#EB9525FF",
    padding: height * 0.018,
    borderRadius: width * 0.02,
    alignItems: "center",
    marginTop: height * 0.01,
    borderColor: "#12A0AF",
    borderWidth: 1.5,
  },
  dateButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: height * 0.01,
  },
  checkbox: {
    width: width * 0.08,
    height: width * 0.08,
    borderWidth: 2,
    borderColor: "#12A0AF",
    borderRadius: width * 0.02,
    justifyContent: "center",
    alignItems: "center",
    marginRight: width * 0.03,
    backgroundColor: "#fff",
  },
  checkboxSelected: {
    backgroundColor: "#12A0AF",
    borderColor: "#4B34C7",
  },
  checkboxCheckmark: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.04,
  },
  checkboxLabel: {
    fontSize: width * 0.045,
    color: "#222",
  },
  dynamicFieldContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginTop: height * 0.01,
    marginBottom: height * 0.01,
    width: width * 0.75,
    justifyContent: "flex-start",
  },
  addButton: {
    backgroundColor: "#22c55e",
    padding: height * 0.018,
    borderRadius: width * 0.6,
    alignItems: "center",
    marginTop: height * 0.01,
    width: width * 0.14,
    borderColor: "#12A0AF",
    borderWidth: 1.5,
  },
  addButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  removeButton: {
    backgroundColor: "#ef4444",
    padding: height * 0.012,
    borderRadius: width * 0.02,
    marginLeft: width * 0.02,
  },
  removeButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: width * 0.045,
  },
  pickerSearchWrapper: {
    width: "100%",
    marginBottom: 2,
  },
  pickerSearchInput: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: width * 0.015,
    padding: height * 0.012,
    marginBottom: 4,
    backgroundColor: "#fff",
    fontSize: width * 0.04,
    width: "100%",
  },
  locationButton: {
    backgroundColor: "#4B34C7",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: "#12A0AF",
    width: "75%",
    alignSelf: "flex-start",
  },
  locationButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: width * 0.045,
    textAlign: "center",
  },
});
