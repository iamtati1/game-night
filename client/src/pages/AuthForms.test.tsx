import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Sign-up and log-in forms: each registration error under its own field, and
 * the autofill tokens that let a password manager save the account as
 * email + password and fill both forms with it.
 */

const register = vi.fn();
vi.mock("../auth/AuthContext.js", () => ({
    useAuth: () => ({ register, login: vi.fn(), user: null, loading: false, unavailable: false })
}));

const { ApiError } = await import("../api/client.js");
const { RegisterPage } = await import("./RegisterPage.js");
const { LoginPage } = await import("./LoginPage.js");

afterEach(() => {
    cleanup();
    register.mockReset();
});

function openRegister() {
    return render(
        <MemoryRouter initialEntries={["/register"]}>
            <Routes>
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/" element={<p>Home</p>} />
            </Routes>
        </MemoryRouter>
    );
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: /create account/i }));

describe("registration errors", () => {
    it("puts each reason under its own field, and marks the field invalid", async () => {
        register.mockRejectedValue(
            new ApiError(400, "Invalid request", [
                { field: "email", message: "Enter a full email address, like name@example.com" },
                { field: "password", message: "Password must be at least 8 characters" }
            ])
        );
        openRegister();
        fill("Email", "test@test");
        fill("Username", "tester");
        fill("Password", "short");
        submit();

        const email = screen.getByLabelText("Email");
        await waitFor(() => expect(email.getAttribute("aria-invalid")).toBe("true"));
        expect(document.getElementById(email.getAttribute("aria-describedby")!)?.textContent).toBe(
            "Enter a full email address, like name@example.com"
        );
        const password = screen.getByLabelText("Password");
        expect(password.getAttribute("aria-invalid")).toBe("true");
        expect(password.getAttribute("aria-describedby")).toContain("reg-password-error");
        expect(screen.getByText("Password must be at least 8 characters")).toBeTruthy();
        // The username was fine, so nothing is said about it.
        expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBeNull();
        // No run-on general message under the button as well.
        expect(document.querySelector(".form-error")).toBeNull();
    });

    it("shows a taken email under the email field", async () => {
        register.mockRejectedValue(
            new ApiError(409, "Already registered", [{ field: "email", message: "That email is already taken" }])
        );
        openRegister();
        submit();

        expect(await screen.findByText("That email is already taken")).toBeTruthy();
        expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    });

    it("keeps a general message for a failure that is not about a field", async () => {
        register.mockRejectedValue(new ApiError(0, "Could not reach the server."));
        openRegister();
        submit();

        expect((await screen.findByRole("alert")).textContent).toBe("Could not reach the server.");
    });

    it("clears the errors on a successful retry", async () => {
        register
            .mockRejectedValueOnce(new ApiError(400, "Invalid request", [{ field: "username", message: "Username must be at least 3 characters" }]))
            .mockResolvedValueOnce(undefined);
        openRegister();
        submit();
        expect(await screen.findByText("Username must be at least 3 characters")).toBeTruthy();

        submit();
        expect(await screen.findByText("Home")).toBeTruthy();
    });
});

describe("password manager autofill", () => {
    it("marks sign-up's email as the login, the display name as a nickname, and the password as new", () => {
        openRegister();

        const email = screen.getByLabelText("Email");
        expect(email.getAttribute("autocomplete")).toBe("username");
        expect(email.getAttribute("type")).toBe("email");
        expect(email.getAttribute("name")).toBe("email");
        expect(screen.getByLabelText("Username").getAttribute("autocomplete")).toBe("nickname");
        expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
        expect(screen.getByLabelText("Password").getAttribute("name")).toBe("password");
    });

    it("marks log-in's email as the same login, and the password as current", () => {
        render(
            <MemoryRouter initialEntries={["/login"]}>
                <LoginPage />
            </MemoryRouter>
        );

        expect(screen.getByLabelText("Email").getAttribute("autocomplete")).toBe("username");
        expect(screen.getByLabelText("Email").getAttribute("name")).toBe("email");
        expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
        expect(screen.getByLabelText("Password").getAttribute("name")).toBe("password");
    });
});
