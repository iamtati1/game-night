import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import { AuthProvider } from "./auth/AuthContext.js";
import "./index.css";
// After index.css on purpose. The world layer redefines the tokens index.css
// already reads -- so re-skinning the palette here re-skins every existing
// game screen for free -- and then fully owns the shell, Home, the map and the
// lesson space. See the header of world.css.
import "./world/world.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <App />
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>
);
