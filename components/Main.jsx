import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import useNetInfo from "../hooks/useNetInfo";
import { getFormsToAPI } from "../services/api";
import MatrixBackground from "./MatrixBackground";
import { Screen } from "./Screen";
import { AnimatedFormCard } from "./FormCard";
import { Login } from "./Login";

export function Main() {
  const [forms, setForms] = useState([]);
  const isConnected = useNetInfo();
  const [IsLogged, setIsLogged] = useState(false);
  

  const loginUrl = "https://4c1c-179-33-13-68.ngrok-free.app/auth/token";
  const loginData = {
    grant_type: "password",
    username: "cgomez@sfisas.com", // Reemplaza con el nombre de usuario
    password: "12345678", // Reemplaza con la contraseña
  };

  const formBody = Object.keys(loginData)
    .map(
      (key) =>
        encodeURIComponent(key) + "=" + encodeURIComponent(loginData[key])
    )
    .join("&");

  useEffect(() => {
    async function Auth_Login() {
      try {
        const response = await fetch(loginUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formBody,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        setIsLogged(true)
        const data = await response.json();
        console.log("Access Token:", data.access_token); // Muestra el token de acceso

        // Puedes almacenar el token si necesitas hacer más peticiones autenticadas.
        console.log(data.access_token);
        return data.access_token;
      } catch (error) {
        console.error("Error during login:", error);
      }
    }

    Auth_Login();
  }, [isConnected]);

  // useEffect(() => {
  //   const getforms = async () => {
  //     if (isConnected) {
  //       try {
  //         const data = await getFormsToAPI();
  //         setForms(data);
  //       } catch (error) {
  //         console.error(`Error obtaining forms:`, error);
  //       }
  //     }
  //   };
  //   getforms();
  // }, [isConnected]);

  return (
     IsLogged == true ? 
    (<Screen>
      {forms.length === 0 ? (
        <View style={styles.container}>
        <MatrixBackground />
        <View style={{ padding: 20 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "bold", color: "#1f2937" }}>
              Email
            </Text>
            <TextInput
              onChangeText={setUsername}
              value={username}
              placeholder="name@company.com"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>
  
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "bold", color: "#1f2937" }}>
              Contraseña
            </Text>
            <TextInput
              onChangeText={setPassword}
              value={password}
              placeholder="••••••••"
              secureTextEntry={true}
              style={styles.input}
            />
          </View>
  
          <TouchableOpacity onPress={handleLogin} style={styles.button}>
            <Text style={styles.buttonText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
      ) : (
        <FlatList
          data={forms}
          keyExtractor={(form) => form.id}
          renderItem={({ item, index }) => (
            <AnimatedFormCard form={item} index={index} />
          )}
        />
      )}
    </Screen>): (<Login/>)
    
  
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    color: "black",
  },
  input: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
    color: "#1f2937",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
