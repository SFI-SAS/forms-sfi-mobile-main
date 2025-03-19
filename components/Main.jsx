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
