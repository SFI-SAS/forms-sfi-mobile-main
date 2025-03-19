import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import useNetInfo from "../hooks/useNetInfo";
import { getFormsToAPI } from "../services/api";
import { Screen } from "./Screen";
import { AnimatedFormCard } from "./FormCard";
import { Login } from "./Login";

export function Main() {
  const [forms, setForms] = useState([]);
  const isConnected = useNetInfo();
  const [IsLogged, setIsLogged] = useState(false);
  

  const loginUrl = "https://api-forms.sfisas.com.co/auth/token";
  const loginData = {
    grant_type: "password",
    username: "maumopita12@gmail.com", // Reemplaza con el nombre de usuario
    password: "Maurox101299", // Reemplaza con la contraseña
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

  useEffect(() => {
    const getforms = async () => {
      if (isConnected) {
        try {
          const data = await getFormsToAPI();
          setForms(data);
        } catch (error) {
          console.error(`Error obtaining forms:`, error);
        }
      }
    };
    getforms();
  }, [isConnected]);

  return (
     IsLogged == true ? 
    (<Screen>
      {forms.length === 0 ? (
        <ActivityIndicator color={"#fff"} size={"large"} />
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
