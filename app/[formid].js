import { Stack } from "expo-router";
import {
  StyleSheet,
  ActivityIndicator,
  Button,
  Text,
  View,
  TextInput,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "../components/Screen";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { getFormToAPI } from "../services/api";

export default function Detail() {
  const { formid } = useLocalSearchParams();
  const [formInfo, setFormInfo] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (formid) {
      const getForm = async () => {
        const data = await getFormToAPI(formid);
        setFormInfo(data);
      };
      getForm();
    }
  }, [formid]);

  const handleInputChange = (value, field) => {
    setFormData({
      ...formData,
      [field]: value,
    });
  };

  const handleSubmit = () => {
    console.log("Datos del formulario:", formData);
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: "#051984" },
          headerTintColor: "white",
          headerLeft: () => {},
          headerTitle: formInfo != null ? formInfo.title : "",
          headerRight: () => {},
        }}
      />
      <View>
        {formInfo === null ? (
          <ActivityIndicator color={"#fff"} size={"large"} />
        ) : (
          <ScrollView>
            <View className="justify-center items-center">
              <Text className="text-black text-center font-bold text-xl mb-5">
                {formInfo.title}
              </Text>
              {formInfo.questions.map((field) => (
                // eslint-disable-next-line no-unused-expressions
                <View key={field.id} style={styles.inputContainer}>
                  <Text style={styles.label}>{field.question_text} :</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="...."
                    onChangeText={(value) =>
                      handleInputChange(value, field.question_text)
                    }
                  />
                </View>
              ))}
            </View>
            <Button title="Enviar" onPress={handleSubmit} />
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "flex-start",
  },
  inputContainer: {
    marginBottom: 15,
    width: "100%",
  },
  label: {
    marginBottom: 5,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "left",
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 5,
    textAlign: "left",
  },
});
