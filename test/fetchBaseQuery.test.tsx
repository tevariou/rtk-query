import { createSlice } from '@reduxjs/toolkit';
import { createApi, fetchBaseQuery } from '@rtk-incubator/rtk-query';
import { setupApiStore } from './helpers';
import { default as crossFetch } from 'cross-fetch';

const defaultHeaders: Record<string, string> = {
  fake: 'header',
  delete: 'true',
  delete2: '1',
};

const baseUrl = 'http://example.com';

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;

    // If we have a token set in state, let's assume that we should be passing it.
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    // A user could customize their behavior here, so we'll just test that custom scenarios would work.
    const potentiallyConflictingKeys = Object.keys(defaultHeaders);
    potentiallyConflictingKeys.forEach((key) => {
      // Check for presence of a default key, if the incoming endpoint headers don't specify it as '', then set it
      const existingValue = headers.get(key);
      if (!existingValue && existingValue !== '') {
        headers.set(key, String(defaultHeaders[key]));
        // If an endpoint sets a header with a value of '', just delete the header.
      } else if (headers.get(key) === '') {
        headers.delete(key);
      }
    });

    return headers;
  },
});

const api = createApi({
  baseQuery,
  endpoints(build) {
    return {
      query: build.query({ query: () => ({ url: '/echo', headers: {} }) }),
      mutation: build.mutation({ query: () => ({ url: '/echo', method: 'POST', credentials: 'omit' }) }),
    };
  },
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token: '',
  },
  reducers: {
    setToken(state, action) {
      state.token = action.payload;
    },
  },
});

const storeRef = setupApiStore(api, { auth: authSlice.reducer });
type RootState = ReturnType<typeof storeRef.store.getState>;

describe('fetchBaseQuery', () => {
  describe('basic functionality', () => {
    it('should return an object for a simple GET request when it is json data', async () => {
      const req = baseQuery(
        '/success',
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      );
      expect(req).toBeInstanceOf(Promise);
      const res = await req;
      expect(res).toBeInstanceOf(Object);
      expect(res.data).toEqual({ value: 'success' });
    });

    it('should return undefined for a simple GET request when the response is empty', async () => {
      const req = baseQuery(
        '/empty',
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      );
      expect(req).toBeInstanceOf(Promise);
      const res = await req;
      expect(res).toBeInstanceOf(Object);
      expect(res.data).toBeUndefined();
    });

    it('should return an error and status for error responses', async () => {
      const req = baseQuery(
        '/error',
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      );
      expect(req).toBeInstanceOf(Promise);
      const res = await req;
      expect(res).toBeInstanceOf(Object);
      expect(res.error).toEqual({ status: 500, data: { value: 'error' } });
    });
  });

  describe('arg.body', () => {
    test('an object provided to body will be serialized when content-type is json', async () => {
      const data = {
        test: 'value',
      };

      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', body: data, method: 'POST' },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.headers['content-type']).toBe('application/json');
      expect(request.body).toEqual(data);
    });

    test('an object provided to body will not be serialized when content-type is not json', async () => {
      const data = {
        test: 'value',
      };

      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', body: data, method: 'POST', headers: { 'content-type': 'text/html' } },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.headers['content-type']).toBe('text/html');
      expect(request.body).toEqual('[object Object]');
    });
  });

  describe('arg.params', () => {
    it('should not serialize missing params', async () => {
      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo' },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.url).toEqual(`${baseUrl}/echo`);
    });

    it('should serialize numeric and boolean params', async () => {
      const params = { a: 1, b: true };

      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', params },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.url).toEqual(`${baseUrl}/echo?a=1&b=true`);
    });

    it('should merge params into existing url querystring', async () => {
      const params = { a: 1, b: true };

      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo?banana=pudding', params },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.url).toEqual(`${baseUrl}/echo?banana=pudding&a=1&b=true`);
    });

    it('should accept a URLSearchParams instance', async () => {
      const params = new URLSearchParams({ apple: 'fruit' });

      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', params },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.url).toEqual(`${baseUrl}/echo?apple=fruit`);
    });

    it('should strip undefined values from the end params', async () => {
      const params = { apple: 'fruit', banana: undefined, randy: null };

      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', params },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.url).toEqual(`${baseUrl}/echo?apple=fruit&randy=null`);
    });
  });

  describe('validateStatus', () => {
    test('validateStatus can return an error even on normal 200 responses', async () => {
      // This is a scenario where an API may always return a 200, but indicates there is an error when success = false
      const res = await baseQuery(
        {
          url: '/nonstandard-error',
          validateStatus: (response, body) => (response.status === 200 && body.success === false ? false : true),
        },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      );

      expect(res.error).toEqual({
        status: 200,
        data: { success: false, message: 'This returns a 200 but is really an error' },
      });
    });
  });

  describe('arg.headers and prepareHeaders', () => {
    test('uses the default headers set in prepareHeaders', async () => {
      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo' },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.headers['fake']).toBe(defaultHeaders['fake']);
      expect(request.headers['delete']).toBe(defaultHeaders['delete']);
      expect(request.headers['delete2']).toBe(defaultHeaders['delete2']);
    });

    test('adds endpoint-level headers to the defaults', async () => {
      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', headers: { authorization: 'Bearer banana' } },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.headers['authorization']).toBe('Bearer banana');
      expect(request.headers['fake']).toBe(defaultHeaders['fake']);
      expect(request.headers['delete']).toBe(defaultHeaders['delete']);
      expect(request.headers['delete2']).toBe(defaultHeaders['delete2']);
    });

    test('it does not set application/json when content-type is set', async () => {
      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', headers: { authorization: 'Bearer banana', 'content-type': 'custom-content-type' } },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.headers['authorization']).toBe('Bearer banana');
      expect(request.headers['content-type']).toBe('custom-content-type');
      expect(request.headers['fake']).toBe(defaultHeaders['fake']);
      expect(request.headers['delete']).toBe(defaultHeaders['delete']);
      expect(request.headers['delete2']).toBe(defaultHeaders['delete2']);
    });

    test('respects the headers from an endpoint over the base headers', async () => {
      const fake = 'fake endpoint value';

      let request: any;
      ({ data: request } = await baseQuery(
        { url: '/echo', headers: { fake, delete: '', delete2: '' } },
        {
          signal: undefined,
          dispatch: storeRef.store.dispatch,
          getState: storeRef.store.getState,
        },
        {}
      ));

      expect(request.headers['fake']).toBe(fake);
      expect(request.headers['delete']).toBeUndefined();
      expect(request.headers['delete2']).toBeUndefined();
    });

    test('prepareHeaders is able to be an async function', async () => {
      let request: any;

      const token = 'accessToken';
      const getAccessTokenAsync = async () => token;

      const _baseQuery = fetchBaseQuery({
        baseUrl,
        prepareHeaders: async (headers) => {
          headers.set('authorization', `Bearer ${await getAccessTokenAsync()}`);
          return headers;
        },
      });

      const doRequest = async () =>
        _baseQuery(
          { url: '/echo' },
          {
            signal: undefined,
            dispatch: storeRef.store.dispatch,
            getState: storeRef.store.getState,
          },
          {}
        );

      ({ data: request } = await doRequest());

      expect(request.headers['authorization']).toBe(`Bearer ${token}`);
    });

    test('prepareHeaders is able to select from a state', async () => {
      let request: any;

      const doRequest = async () =>
        baseQuery(
          { url: '/echo' },
          {
            signal: undefined,
            dispatch: storeRef.store.dispatch,
            getState: storeRef.store.getState,
          },
          {}
        );

      ({ data: request } = await doRequest());

      expect(request.headers['authorization']).toBeUndefined();

      // Set a token and the follow up request should have the header injected by prepareHeaders
      const token = 'fakeToken!';
      storeRef.store.dispatch(authSlice.actions.setToken(token));
      ({ data: request } = await doRequest());

      expect(request.headers['authorization']).toBe(`Bearer ${token}`);
    });
  });

  test('lets a header be undefined', async () => {
    let request: any;
    ({ data: request } = await baseQuery(
      { url: '/echo', headers: undefined },
      {
        signal: undefined,
        dispatch: storeRef.store.dispatch,
        getState: storeRef.store.getState,
      },
      {}
    ));

    expect(request.headers['fake']).toBe(defaultHeaders['fake']);
    expect(request.headers['delete']).toBe(defaultHeaders['delete']);
    expect(request.headers['delete2']).toBe(defaultHeaders['delete2']);
  });

  test('allows for possibly undefined header key/values', async () => {
    const banana = '1' as '1' | undefined;
    let request: any;
    ({ data: request } = await baseQuery(
      { url: '/echo', headers: { banana } },
      {
        signal: undefined,
        dispatch: storeRef.store.dispatch,
        getState: storeRef.store.getState,
      },
      {}
    ));

    expect(request.headers['banana']).toBe('1');
    expect(request.headers['fake']).toBe(defaultHeaders['fake']);
    expect(request.headers['delete']).toBe(defaultHeaders['delete']);
    expect(request.headers['delete2']).toBe(defaultHeaders['delete2']);
  });

  test('strips undefined values from the headers', async () => {
    const banana = undefined as '1' | undefined;
    let request: any;
    ({ data: request } = await baseQuery(
      { url: '/echo', headers: { banana } },
      {
        signal: undefined,
        dispatch: storeRef.store.dispatch,
        getState: storeRef.store.getState,
      },
      {}
    ));

    expect(request.headers['banana']).toBeUndefined();
    expect(request.headers['fake']).toBe(defaultHeaders['fake']);
    expect(request.headers['delete']).toBe(defaultHeaders['delete']);
    expect(request.headers['delete2']).toBe(defaultHeaders['delete2']);
  });
});

describe('fetchFn', () => {
  test('accepts a custom fetchFn', async () => {
    const baseUrl = 'http://example.com';
    const params = new URLSearchParams({ apple: 'fruit' });

    const baseQuery = fetchBaseQuery({
      baseUrl,
      fetchFn: crossFetch,
    });

    let request: any;
    ({ data: request } = await baseQuery(
      { url: '/echo', params },
      {
        signal: undefined,
        dispatch: storeRef.store.dispatch,
        getState: storeRef.store.getState,
      },
      {}
    ));

    expect(request.url).toEqual(`${baseUrl}/echo?apple=fruit`);
  });
});

describe('FormData', () => {
  test('sets the right headers when sending FormData', async () => {
    let request: any;
    const body = new FormData();
    body.append('username', 'test');
    body.append('file', new Blob([JSON.stringify({ hello: 'there' }, null, 2)], { type: 'application/json' }));

    ({ data: request } = await baseQuery(
      { url: '/echo', method: 'POST', body },
      {
        signal: undefined,
        dispatch: storeRef.store.dispatch,
        getState: storeRef.store.getState,
      },
      {}
    ));
    expect(request.headers['content-type']).not.toContain('application/json');
  });
});
