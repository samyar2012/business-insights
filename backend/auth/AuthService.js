const url = "http://localhost:3000/api/auth";

export const login = async (email, password) => {
    const response = await fetch(`${url}/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });
    return response.json();
};

export const signup = async (email, password) => {
    const response = await fetch(`${url}/signup`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password })
    });
    return response.json();
};

export const logout = async () => {
    const response = await fetch(`${url}/logout`, {
        method: "POST",
    });
    return response.json();
};

export const getUser = async () => {
    const response = await fetch(`${url}/user`, {
        method: "GET",
    });
    return response.json();
};

export const updateUser = async (user) => {
    const response = await fetch(`${url}/user`, {
        method: "PUT",
        body: JSON.stringify(user),
    });
    return response.json();
};

export const deleteUser = async () => {
    const response = await fetch(`${url}/user`, {
        method: "DELETE",
    }); 

    return response.json();
};

export const getUser = async () => {
    const response = await fetch(`${url}/user`, {
        method: "GET",
    });
    return response.json();
};

export const getUser = async () => {
    const response = await fetch(`${url}/user`, {
        method: "GET",  